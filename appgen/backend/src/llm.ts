import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface LLMCallOptions {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  label?: string;
}

export interface LLMResult {
  content: string;
  parsed: unknown;
  latency_ms: number;
  tokens_used: number;
}

/**
 * Call Claude and parse the response as JSON.
 * Retries up to `maxRetries` times if JSON parsing fails.
 */
export async function callLLM(
  options: LLMCallOptions,
  maxRetries = 3
): Promise<LLMResult> {
  const start = Date.now();
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.1,
        system:
          options.system +
          "\n\nCRITICAL: Respond with ONLY valid JSON. No markdown, no backticks, no explanation. Raw JSON object only.",
        messages: [{ role: "user", content: options.user }],
      });

      const raw = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("");

      // Strip any accidental markdown fences
      const cleaned = raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned);

      return {
        content: cleaned,
        parsed,
        latency_ms: Date.now() - start,
        tokens_used: response.usage.input_tokens + response.usage.output_tokens,
      };
    } catch (err) {
      lastError = err as Error;
      if (attempt < maxRetries) {
        await sleep(500 * attempt);
      }
    }
  }

  throw new Error(
    `LLM call failed after ${maxRetries} attempts: ${lastError?.message}`
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
