import { callLLM } from "../llm.js";
import {
  DBSchemaSchema,
  APISchemaSchema,
  UISchemaSchema,
  AuthSchemaSchema,
  type AppSchema,
  type ValidationReport,
  type ValidationError,
  type RepairRecord,
} from "../schemas.js";

const MAX_REPAIR_ATTEMPTS = 3;

// ─── Cross-layer consistency checks ──────────────────────────────────────────

function validateCrossLayer(schema: AppSchema): ValidationError[] {
  const errors: ValidationError[] = [];

  const tableNames = new Set(schema.db_schema.tables.map((t) => t.name));
  const apiPaths = new Set(schema.api_schema.endpoints.map((e) => e.path));

  // 1. API endpoints must reference real DB tables
  for (const ep of schema.api_schema.endpoints) {
    if (ep.db_table && !tableNames.has(ep.db_table)) {
      errors.push({
        layer: "cross_layer",
        path: `api.endpoints[${ep.path}].db_table`,
        message: `API endpoint "${ep.path}" references non-existent table "${ep.db_table}"`,
        severity: "error",
      });
    }
  }

  // 2. UI components must reference real API endpoints
  for (const page of schema.ui_schema.pages) {
    for (const comp of page.components) {
      if (comp.api_endpoint && !apiPaths.has(comp.api_endpoint)) {
        // Check if it's close (e.g. missing /api prefix)
        errors.push({
          layer: "cross_layer",
          path: `ui.pages[${page.path}].components[${comp.label}].api_endpoint`,
          message: `UI component "${comp.label}" on page "${page.path}" references non-existent endpoint "${comp.api_endpoint}"`,
          severity: "error",
        });
      }
    }
  }

  // 3. Auth roles in UI must exist in auth schema
  const authRoles = new Set(schema.auth_schema.roles.map((r) => r.name));
  for (const page of schema.ui_schema.pages) {
    for (const role of page.roles) {
      if (role && !authRoles.has(role)) {
        errors.push({
          layer: "cross_layer",
          path: `ui.pages[${page.path}].roles`,
          message: `Page "${page.path}" requires role "${role}" which is not defined in auth schema`,
          severity: "error",
        });
      }
    }
  }

  // 4. Every table must have an 'id' primary key column
  for (const table of schema.db_schema.tables) {
    const hasPK = table.columns.some((c) => c.primary_key);
    if (!hasPK) {
      errors.push({
        layer: "db",
        path: `db.tables[${table.name}]`,
        message: `Table "${table.name}" has no primary key column`,
        severity: "error",
      });
    }
  }

  // 5. Foreign keys must reference existing tables
  for (const table of schema.db_schema.tables) {
    for (const col of table.columns) {
      if (col.references && !tableNames.has(col.references.table)) {
        errors.push({
          layer: "db",
          path: `db.tables[${table.name}].columns[${col.name}].references`,
          message: `Column "${table.name}.${col.name}" references non-existent table "${col.references.table}"`,
          severity: "error",
        });
      }
    }
  }

  return errors;
}

// ─── Targeted repair for a specific layer ────────────────────────────────────

async function repairLayer(
  schema: AppSchema,
  errors: ValidationError[],
  layer: "db" | "api" | "ui" | "auth" | "cross_layer",
  attempt: number
): Promise<{ schema: AppSchema; records: RepairRecord[] }> {
  const records: RepairRecord[] = [];
  const layerErrors = errors.filter(
    (e) => e.layer === layer || e.layer === "cross_layer"
  );

  if (layerErrors.length === 0) return { schema, records };

  const errorSummary = layerErrors
    .map((e) => `- [${e.layer}] ${e.path}: ${e.message}`)
    .join("\n");

  // Target only the broken sub-schema
  const targetKey =
    layer === "db"
      ? "db_schema"
      : layer === "api"
      ? "api_schema"
      : layer === "ui"
      ? "ui_schema"
      : "auth_schema";

  const currentSubSchema =
    layer === "db" || layer === "cross_layer"
      ? schema.db_schema
      : layer === "api"
      ? schema.api_schema
      : layer === "ui"
      ? schema.ui_schema
      : schema.auth_schema;

  const repairPrompt = `You are repairing a broken schema. Fix ONLY the errors listed below. Return the corrected JSON for the ${targetKey} sub-schema only.

ERRORS TO FIX:
${errorSummary}

FULL APP SCHEMA CONTEXT (for cross-references):
DB tables: ${schema.db_schema.tables.map((t) => t.name).join(", ")}
API endpoints: ${schema.api_schema.endpoints.map((e) => e.path).join(", ")}
Auth roles: ${schema.auth_schema.roles.map((r) => r.name).join(", ")}

CURRENT ${targetKey.toUpperCase()} (fix this):
${JSON.stringify(currentSubSchema, null, 2)}`;

  try {
    const result = await callLLM({
      system: `You repair broken JSON schemas. Return ONLY the fixed JSON sub-schema, no explanation.`,
      user: repairPrompt,
      label: `repair_${layer}_attempt${attempt}`,
      maxTokens: 4096,
      temperature: 0.05,
    });

    let repairedSubSchema = result.parsed;

    // Validate the repaired sub-schema
    if (layer === "db" || layer === "cross_layer") {
      repairedSubSchema = DBSchemaSchema.parse(repairedSubSchema);
      schema = { ...schema, db_schema: repairedSubSchema };
    } else if (layer === "api") {
      repairedSubSchema = APISchemaSchema.parse(repairedSubSchema);
      schema = { ...schema, api_schema: repairedSubSchema };
    } else if (layer === "ui") {
      repairedSubSchema = UISchemaSchema.parse(repairedSubSchema);
      schema = { ...schema, ui_schema: repairedSubSchema };
    } else if (layer === "auth") {
      repairedSubSchema = AuthSchemaSchema.parse(repairedSubSchema);
      schema = { ...schema, auth_schema: repairedSubSchema };
    }

    records.push({
      layer,
      error: errorSummary,
      repair_prompt_used: repairPrompt.slice(0, 300) + "...",
      attempt,
      success: true,
    });
  } catch (err) {
    records.push({
      layer,
      error: errorSummary,
      repair_prompt_used: repairPrompt.slice(0, 300) + "...",
      attempt,
      success: false,
    });
  }

  return { schema, records };
}

// ─── Main Validation + Repair Loop ───────────────────────────────────────────

export async function validateAndRepair(
  schema: AppSchema
): Promise<{ result: AppSchema; report: ValidationReport; latency_ms: number }> {
  const start = Date.now();
  const allRepairs: RepairRecord[] = [];
  let currentSchema = schema;

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    const crossErrors = validateCrossLayer(currentSchema);

    if (crossErrors.length === 0) {
      return {
        result: currentSchema,
        report: {
          passed: true,
          errors: [],
          repairs: allRepairs,
        },
        latency_ms: Date.now() - start,
      };
    }

    // Group errors by layer and repair each affected layer once per attempt
    const affectedLayers = new Set(
      crossErrors.map((e) =>
        e.layer === "cross_layer"
          ? // For cross-layer errors, fix the dependent layer (ui/api)
            e.path.startsWith("ui")
            ? "ui"
            : e.path.startsWith("api")
            ? "api"
            : "db"
          : e.layer
      )
    ) as Set<"db" | "api" | "ui" | "auth">;

    for (const layer of affectedLayers) {
      const { schema: repaired, records } = await repairLayer(
        currentSchema,
        crossErrors,
        layer,
        attempt
      );
      currentSchema = repaired;
      allRepairs.push(...records);
    }
  }

  // Final check after all repair attempts
  const finalErrors = validateCrossLayer(currentSchema);

  return {
    result: currentSchema,
    report: {
      passed: finalErrors.length === 0,
      errors: finalErrors,
      repairs: allRepairs,
    },
    latency_ms: Date.now() - start,
  };
}
