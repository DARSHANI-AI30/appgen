import { callLLM } from "../llm.js";
import { IntentSpecSchema, type IntentSpec } from "../schemas.js";

const SYSTEM_PROMPT = `You are an intent extraction engine for an app generation system.
Your job is to parse a user's natural language app description into a structured JSON specification.

Output this exact JSON shape:
{
  "app_name": "string - short name for the app",
  "description": "string - one sentence summary",
  "entities": ["array of main data entities, e.g. User, Product, Order"],
  "features": ["array of features, e.g. auth, dashboard, payments, role-based-access"],
  "roles": ["array of user roles, e.g. admin, user, manager"],
  "auth_required": true/false,
  "payments_required": true/false,
  "ambiguities": ["list any unclear or conflicting requirements"],
  "assumptions": ["list assumptions you made for missing details"]
}

Rules:
- Always include 'user' in roles if auth is required
- Always include a 'users' entity if auth is required
- If the user mentions 'admin', include 'admin' in roles
- If payments are mentioned, set payments_required to true
- List ALL ambiguous requirements in the ambiguities array
- Make reasonable assumptions for missing details and document them`;

export async function extractIntent(
  userPrompt: string
): Promise<{ result: IntentSpec; latency_ms: number }> {
  const start = Date.now();

  const llmResult = await callLLM({
    system: SYSTEM_PROMPT,
    user: `Parse this app description into the required JSON format:\n\n"${userPrompt}"`,
    label: "stage1_intent",
    temperature: 0.1,
  });

  const parsed = IntentSpecSchema.parse(llmResult.parsed);

  return {
    result: parsed,
    latency_ms: Date.now() - start,
  };
}
