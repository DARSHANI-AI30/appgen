import { callLLM } from "../llm.js";
import {
  DBSchemaSchema,
  APISchemaSchema,
  UISchemaSchema,
  AuthSchemaSchema,
  type DesignSpec,
  type DBSchema,
  type APISchema,
  type UISchema,
  type AuthSchema,
  type AppSchema,
} from "../schemas.js";

// ─── DB Schema Generator ─────────────────────────────────────────────────────

async function generateDBSchema(design: DesignSpec): Promise<DBSchema> {
  const result = await callLLM({
    system: `You generate SQLite database schemas. Output JSON matching this exact structure:
{
  "tables": [
    {
      "name": "table_name",
      "columns": [
        {
          "name": "col_name",
          "type": "TEXT|INTEGER|REAL|BOOLEAN|DATETIME|UUID|BLOB",
          "primary_key": true/false,
          "not_null": true/false,
          "unique": true/false,
          "default_value": "optional",
          "references": {"table": "other_table", "column": "id"} 
        }
      ],
      "indexes": [{"columns": ["col1"], "unique": false}]
    }
  ]
}
Rules:
- Every table MUST have id column: TEXT, primary_key:true, not_null:true (SQLite UUIDs stored as TEXT)
- created_at and updated_at: DATETIME, not_null:true
- Foreign keys use "references" field
- Enums stored as TEXT with CHECK constraints handled in application layer
- Boolean stored as INTEGER (0/1) in SQLite`,
    user: `Generate the database schema for this system design:\n\n${JSON.stringify(design, null, 2)}`,
    label: "stage3_db",
    maxTokens: 4096,
  });

  return DBSchemaSchema.parse(result.parsed);
}

// ─── API Schema Generator ─────────────────────────────────────────────────────

async function generateAPISchema(design: DesignSpec): Promise<APISchema> {
  const result = await callLLM({
    system: `You generate REST API schemas. Output JSON matching this exact structure:
{
  "base_path": "/api",
  "endpoints": [
    {
      "path": "/resource",
      "method": "GET|POST|PUT|PATCH|DELETE",
      "summary": "what this endpoint does",
      "auth_required": true/false,
      "roles": ["admin","user"],
      "request_body": {
        "field_name": {"type": "string|number|boolean", "required": true, "description": "..."}
      },
      "response": {
        "success_status": 200,
        "body": {"field": "type description"}
      },
      "db_table": "matching_table_name"
    }
  ]
}
Rules:
- Include CRUD endpoints for every entity (list, get by id, create, update, delete)
- Auth endpoints: POST /api/auth/login, POST /api/auth/register (if auth enabled)
- Use plural snake_case for resource paths: /api/users, /api/blog_posts
- db_table MUST exactly match a table name from the database schema
- Protected endpoints must have auth_required:true
- Admin-only endpoints must have roles:["admin"]
- Path parameters use :id format: /api/users/:id`,
    user: `Generate the API schema for this system design:\n\n${JSON.stringify(design, null, 2)}`,
    label: "stage3_api",
    maxTokens: 5000,
  });

  return APISchemaSchema.parse(result.parsed);
}

// ─── UI Schema Generator ─────────────────────────────────────────────────────

async function generateUISchema(design: DesignSpec): Promise<UISchema> {
  const result = await callLLM({
    system: `You generate UI page schemas for web applications. Output JSON matching this exact structure:
{
  "app_name": "App Name",
  "pages": [
    {
      "name": "PageName",
      "path": "/path",
      "title": "Page Title",
      "auth_required": true/false,
      "roles": [],
      "layout": "full|sidebar|centered|dashboard",
      "components": [
        {
          "type": "form|table|card|stat|chart|nav|button|modal",
          "label": "Component label",
          "fields": [
            {
              "name": "field_name",
              "label": "Field Label",
              "input_type": "text|email|password|number|select|textarea|date|checkbox",
              "required": true/false,
              "options": ["only for select type"],
              "api_field": "matching api request body field name"
            }
          ],
          "api_endpoint": "/api/resource",
          "roles": []
        }
      ]
    }
  ],
  "nav_items": [{"label": "Nav Item", "path": "/path", "roles": []}]
}
Rules:
- Include a login page at /login if auth is enabled (centered layout, form component)
- Include a dashboard page at /dashboard (dashboard layout)
- Each entity gets a list page (table component) and a create/edit form page
- api_endpoint in components MUST match an actual API endpoint path
- api_field in form fields MUST match a request_body field name in the matched endpoint
- Admin pages must have roles:["admin"]`,
    user: `Generate the UI schema for this system design:\n\n${JSON.stringify(design, null, 2)}`,
    label: "stage3_ui",
    maxTokens: 5000,
  });

  return UISchemaSchema.parse(result.parsed);
}

// ─── Auth Schema Generator ────────────────────────────────────────────────────

async function generateAuthSchema(design: DesignSpec): Promise<AuthSchema> {
  const result = await callLLM({
    system: `You generate authentication and authorization schemas. Output JSON matching this exact structure:
{
  "enabled": true/false,
  "strategy": "jwt|session|none",
  "roles": [
    {
      "name": "role_name",
      "permissions": ["create:resource", "read:resource", "update:resource", "delete:resource"],
      "can_access_routes": ["/dashboard", "/admin"]
    }
  ],
  "login_endpoint": "/api/auth/login",
  "register_endpoint": "/api/auth/register",
  "token_expiry": "24h"
}
Rules:
- Use JWT strategy
- 'admin' role gets all permissions (wildcard: "*")
- 'user' role gets read permissions for own resources, create/update own records
- Permissions follow format: "action:resource" (create:users, read:posts, etc.)
- can_access_routes lists all routes this role can access
- token_expiry uses zeit/ms format: "1h", "24h", "7d"`,
    user: `Generate the auth schema for this system design:\n\n${JSON.stringify(design, null, 2)}`,
    label: "stage3_auth",
    maxTokens: 2000,
  });

  return AuthSchemaSchema.parse(result.parsed);
}

// ─── Main: Run all 4 in parallel ─────────────────────────────────────────────

export async function generateSchemas(
  design: DesignSpec
): Promise<{ result: AppSchema; latency_ms: number }> {
  const start = Date.now();

  const [db, api, ui, auth] = await Promise.all([
    generateDBSchema(design),
    generateAPISchema(design),
    generateUISchema(design),
    generateAuthSchema(design),
  ]);

  return {
    result: { db_schema: db, api_schema: api, ui_schema: ui, auth_schema: auth },
    latency_ms: Date.now() - start,
  };
}
