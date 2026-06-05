import { callLLM } from "../llm.js";
import { DesignSpecSchema, type IntentSpec, type DesignSpec } from "../schemas.js";

const SYSTEM_PROMPT = `You are a system architect for an app generation compiler.
Given a structured intent specification, produce a detailed system design.

Output this exact JSON shape:
{
  "app_name": "string",
  "entities": [
    {
      "name": "EntityName",
      "table_name": "table_name_snake_case",
      "fields": [
        {
          "name": "field_name",
          "type": "string|number|boolean|date|uuid|text|enum",
          "required": true/false,
          "unique": true/false,
          "enum_values": ["only if type is enum"],
          "foreign_key": "other_table.column (only if FK)",
          "default_value": "optional default"
        }
      ],
      "relations": [
        {
          "type": "one_to_many|many_to_one|many_to_many|one_to_one",
          "target_entity": "OtherEntity",
          "field": "field_name"
        }
      ]
    }
  ],
  "auth_model": {
    "enabled": true/false,
    "strategy": "jwt|session|none",
    "roles": ["admin","user"],
    "protected_routes": ["/dashboard", "/admin"]
  },
  "flows": [
    {
      "name": "flow name",
      "description": "what this flow does",
      "steps": ["step 1", "step 2"]
    }
  ],
  "payments": {
    "enabled": true/false,
    "provider": "stripe",
    "plans": [{"name": "premium", "price": 9.99}]
  },
  "assumptions": ["any assumptions made"]
}

Rules:
- Every entity MUST have an 'id' field of type 'uuid' as the first field
- Every entity MUST have 'created_at' and 'updated_at' fields of type 'date'
- If auth is required, the 'users' entity MUST have: email (string, unique), password_hash (string), role (enum with the roles)
- Foreign keys must reference actual entities you define
- Use snake_case for all field names and table names
- Always use JWT strategy for auth
- Protected routes should match features described`;

export async function designSystem(
  intent: IntentSpec
): Promise<{ result: DesignSpec; latency_ms: number }> {
  const start = Date.now();

  const llmResult = await callLLM({
    system: SYSTEM_PROMPT,
    user: `Design the system architecture for this intent specification:\n\n${JSON.stringify(intent, null, 2)}`,
    label: "stage2_design",
    maxTokens: 6000,
    temperature: 0.1,
  });

  const parsed = DesignSpecSchema.parse(llmResult.parsed);

  return {
    result: parsed,
    latency_ms: Date.now() - start,
  };
}
