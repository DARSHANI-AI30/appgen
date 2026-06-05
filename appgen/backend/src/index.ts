import express from "express";
import cors from "cors";
import { runPipeline } from "./pipeline.js";
import { generateSQL, generateExpressRoutes, generateHTMLPages } from "./runtime/generator.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (_req: express.Request, res: express.Response) => {
  res.json({ status: "ok", version: "1.0.0" });
});

// ── Main pipeline endpoint ────────────────────────────────────────────────────
app.post("/api/generate", async (req: express.Request, res: express.Response) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
    return res.status(400).json({ error: "Prompt is required (min 3 chars)" });
  }

  const start = Date.now();

  try {
    const result = await runPipeline(prompt.trim());

    // Add generated artifacts
    const sql = generateSQL(result.schema);
    const routes = generateExpressRoutes(result.schema);
    const pages = generateHTMLPages(result.schema);

    res.json({
      success: true,
      result: {
        ...result,
        artifacts: {
          sql_ddl: sql,
          express_routes: routes,
          html_pages: pages,
        },
      },
      latency_ms: Date.now() - start,
    });
  } catch (err: any) {
    console.error("Pipeline error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
      latency_ms: Date.now() - start,
    });
  }
});

// ── Streaming endpoint (SSE) ──────────────────────────────────────────────────
app.post("/api/generate/stream", async (req: express.Request, res: express.Response) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Prompt is required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    send("start", { message: "Pipeline started", prompt });

    const result = await runPipeline(prompt.trim(), {
      onStageComplete: (stage, data) => {
        send("stage", { stage, data });
      },
    });

    const sql = generateSQL(result.schema);
    const routes = generateExpressRoutes(result.schema);
    const pages = generateHTMLPages(result.schema);

    send("complete", {
      result: { ...result, artifacts: { sql_ddl: sql, express_routes: routes, html_pages: pages } },
    });
  } catch (err: any) {
    send("error", { message: err.message });
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n🟢 AppGen Backend running on http://localhost:${PORT}`);
  console.log(`   POST /api/generate        - Full pipeline`);
  console.log(`   POST /api/generate/stream - Streaming (SSE)\n`);
});
