import { z } from "zod";

// ─── Stage 1: Intent Spec ────────────────────────────────────────────────────

export const IntentSpecSchema = z.object({
  app_name: z.string().min(1),
  description: z.string(),
  entities: z.array(z.string()).min(1),
  features: z.array(z.string()),
  roles: z.array(z.string()).default(["user"]),
  auth_required: z.boolean(),
  payments_required: z.boolean(),
  ambiguities: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
});
export type IntentSpec = z.infer<typeof IntentSpecSchema>;

// ─── Stage 2: Design Spec ────────────────────────────────────────────────────

export const EntityFieldSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "date", "uuid", "text", "enum"]),
  required: z.boolean().default(true),
  unique: z.boolean().default(false),
  enum_values: z.array(z.string()).optional(),
  foreign_key: z.string().optional(), // "table.column"
  default_value: z.string().optional(),
});

export const EntitySchema = z.object({
  name: z.string(),
  table_name: z.string(),
  fields: z.array(EntityFieldSchema).min(1),
  relations: z.array(
    z.object({
      type: z.enum(["one_to_many", "many_to_one", "many_to_many", "one_to_one"]),
      target_entity: z.string(),
      field: z.string(),
    })
  ).default([]),
});

export const DesignSpecSchema = z.object({
  app_name: z.string(),
  entities: z.array(EntitySchema).min(1),
  auth_model: z.object({
    enabled: z.boolean(),
    strategy: z.enum(["jwt", "session", "none"]),
    roles: z.array(z.string()),
    protected_routes: z.array(z.string()).default([]),
  }),
  flows: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      steps: z.array(z.string()),
    })
  ).default([]),
  payments: z.object({
    enabled: z.boolean(),
    provider: z.string().optional(),
    plans: z.array(z.object({ name: z.string(), price: z.number() })).optional(),
  }),
  assumptions: z.array(z.string()).default([]),
});
export type DesignSpec = z.infer<typeof DesignSpecSchema>;

// ─── Stage 3: App Schema (four sub-schemas) ──────────────────────────────────

export const DBColumnSchema = z.object({
  name: z.string(),
  type: z.enum(["TEXT", "INTEGER", "REAL", "BOOLEAN", "DATETIME", "UUID", "BLOB"]),
  primary_key: z.boolean().default(false),
  not_null: z.boolean().default(false),
  unique: z.boolean().default(false),
  default_value: z.string().optional(),
  references: z.object({ table: z.string(), column: z.string() }).optional(),
});

export const DBTableSchema = z.object({
  name: z.string(),
  columns: z.array(DBColumnSchema).min(1),
  indexes: z.array(z.object({ columns: z.array(z.string()), unique: z.boolean().default(false) })).default([]),
});

export const DBSchemaSchema = z.object({
  tables: z.array(DBTableSchema).min(1),
});
export type DBSchema = z.infer<typeof DBSchemaSchema>;

export const APIEndpointSchema = z.object({
  path: z.string().startsWith("/"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  summary: z.string(),
  auth_required: z.boolean().default(false),
  roles: z.array(z.string()).default([]),
  request_body: z
    .record(
      z.object({
        type: z.string(),
        required: z.boolean().default(false),
        description: z.string().optional(),
      })
    )
    .optional(),
  response: z.object({
    success_status: z.number(),
    body: z.record(z.string()),
  }),
  db_table: z.string().optional(), // cross-layer link
});

export const APISchemaSchema = z.object({
  base_path: z.string().default("/api"),
  endpoints: z.array(APIEndpointSchema).min(1),
});
export type APISchema = z.infer<typeof APISchemaSchema>;

export const UIComponentSchema = z.object({
  type: z.enum(["form", "table", "card", "stat", "chart", "nav", "button", "modal"]),
  label: z.string(),
  fields: z
    .array(
      z.object({
        name: z.string(),
        label: z.string(),
        input_type: z.enum(["text", "email", "password", "number", "select", "textarea", "date", "checkbox"]),
        required: z.boolean().default(false),
        options: z.array(z.string()).optional(),
        api_field: z.string().optional(), // cross-layer link
      })
    )
    .default([]),
  api_endpoint: z.string().optional(), // cross-layer link
  roles: z.array(z.string()).default([]),
});

export const UIPageSchema = z.object({
  name: z.string(),
  path: z.string().startsWith("/"),
  title: z.string(),
  auth_required: z.boolean().default(false),
  roles: z.array(z.string()).default([]),
  components: z.array(UIComponentSchema).min(1),
  layout: z.enum(["full", "sidebar", "centered", "dashboard"]).default("full"),
});

export const UISchemaSchema = z.object({
  app_name: z.string(),
  pages: z.array(UIPageSchema).min(1),
  nav_items: z.array(z.object({ label: z.string(), path: z.string(), roles: z.array(z.string()).default([]) })).default([]),
});
export type UISchema = z.infer<typeof UISchemaSchema>;

export const AuthSchemaSchema = z.object({
  enabled: z.boolean(),
  strategy: z.enum(["jwt", "session", "none"]),
  roles: z.array(
    z.object({
      name: z.string(),
      permissions: z.array(z.string()),
      can_access_routes: z.array(z.string()),
    })
  ),
  login_endpoint: z.string().optional(),
  register_endpoint: z.string().optional(),
  token_expiry: z.string().optional(),
});
export type AuthSchema = z.infer<typeof AuthSchemaSchema>;

export const AppSchemaSchema = z.object({
  db_schema: DBSchemaSchema,
  api_schema: APISchemaSchema,
  ui_schema: UISchemaSchema,
  auth_schema: AuthSchemaSchema,
});
export type AppSchema = z.infer<typeof AppSchemaSchema>;

// ─── Pipeline Result ─────────────────────────────────────────────────────────

export interface PipelineResult {
  intent: IntentSpec;
  design: DesignSpec;
  schema: AppSchema;
  validation: ValidationReport;
  runtime_output?: RuntimeOutput;
  meta: {
    total_latency_ms: number;
    stage_latencies: Record<string, number>;
    total_retries: number;
    assumptions: string[];
    ambiguities: string[];
  };
}

export interface ValidationReport {
  passed: boolean;
  errors: ValidationError[];
  repairs: RepairRecord[];
}

export interface ValidationError {
  layer: "db" | "api" | "ui" | "auth" | "cross_layer";
  path: string;
  message: string;
  severity: "error" | "warning";
}

export interface RepairRecord {
  layer: string;
  error: string;
  repair_prompt_used: string;
  attempt: number;
  success: boolean;
}

export interface RuntimeOutput {
  tables_created: string[];
  routes_registered: string[];
  pages_generated: string[];
}
