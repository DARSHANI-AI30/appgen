import { extractIntent } from "./stages/stage1_intent.js";
import { designSystem } from "./stages/stage2_design.js";
import { generateSchemas } from "./stages/stage3_schemas.js";
import { validateAndRepair } from "./stages/stage4_validate.js";
import { simulateRuntime } from "./runtime/generator.js";
import type { PipelineResult } from "./schemas.js";

export interface PipelineOptions {
  onStageComplete?: (stage: string, data: unknown) => void;
}

export async function runPipeline(
  userPrompt: string,
  opts: PipelineOptions = {}
): Promise<PipelineResult> {
  const pipelineStart = Date.now();
  const stageTimes: Record<string, number> = {};

  console.log(`\n🚀 Pipeline started for: "${userPrompt.slice(0, 80)}..."\n`);

  // ── Stage 1: Intent Extraction ───────────────────────────────────────────
  console.log("📋 Stage 1: Extracting intent...");
  const s1 = await extractIntent(userPrompt);
  stageTimes["stage1_intent"] = s1.latency_ms;
  console.log(`   ✓ Entities: ${s1.result.entities.join(", ")}`);
  console.log(`   ✓ Features: ${s1.result.features.join(", ")}`);
  if (s1.result.ambiguities.length > 0) {
    console.log(`   ⚠ Ambiguities: ${s1.result.ambiguities.join("; ")}`);
  }
  opts.onStageComplete?.("intent", s1.result);

  // ── Stage 2: System Design ───────────────────────────────────────────────
  console.log("\n🏗️  Stage 2: Designing system...");
  const s2 = await designSystem(s1.result);
  stageTimes["stage2_design"] = s2.latency_ms;
  console.log(`   ✓ Entities designed: ${s2.result.entities.length}`);
  console.log(`   ✓ Auth: ${s2.result.auth_model.strategy}`);
  opts.onStageComplete?.("design", s2.result);

  // ── Stage 3: Schema Generation (parallel) ───────────────────────────────
  console.log("\n⚡ Stage 3: Generating schemas (parallel)...");
  const s3 = await generateSchemas(s2.result);
  stageTimes["stage3_schemas"] = s3.latency_ms;
  console.log(`   ✓ DB tables: ${s3.result.db_schema.tables.length}`);
  console.log(`   ✓ API endpoints: ${s3.result.api_schema.endpoints.length}`);
  console.log(`   ✓ UI pages: ${s3.result.ui_schema.pages.length}`);
  console.log(`   ✓ Auth roles: ${s3.result.auth_schema.roles.length}`);
  opts.onStageComplete?.("schemas", s3.result);

  // ── Stage 4: Validation + Repair ─────────────────────────────────────────
  console.log("\n🔍 Stage 4: Validating and repairing...");
  const s4 = await validateAndRepair(s3.result);
  stageTimes["stage4_validate"] = s4.latency_ms;
  if (s4.report.passed) {
    console.log("   ✓ Validation passed");
  } else {
    console.log(`   ⚠ Validation issues remain: ${s4.report.errors.length}`);
  }
  if (s4.report.repairs.length > 0) {
    console.log(`   🔧 Repairs applied: ${s4.report.repairs.length}`);
  }
  opts.onStageComplete?.("validation", s4.report);

  // ── Stage 5: Runtime Simulation ──────────────────────────────────────────
  console.log("\n🎯 Stage 5: Simulating runtime...");
  const runtime = simulateRuntime(s4.result);
  console.log(`   ✓ Tables: ${runtime.tables_created.join(", ")}`);
  console.log(`   ✓ Routes: ${runtime.routes_registered.length} registered`);
  console.log(`   ✓ Pages: ${runtime.pages_generated.join(", ")}`);
  opts.onStageComplete?.("runtime", runtime);

  const totalLatency = Date.now() - pipelineStart;
  console.log(`\n✅ Pipeline complete in ${totalLatency}ms\n`);

  return {
    intent: s1.result,
    design: s2.result,
    schema: s4.result,
    validation: s4.report,
    runtime_output: runtime,
    meta: {
      total_latency_ms: totalLatency,
      stage_latencies: stageTimes,
      total_retries: s4.report.repairs.length,
      assumptions: [
        ...s1.result.assumptions,
        ...s2.result.assumptions,
      ],
      ambiguities: s1.result.ambiguities,
    },
  };
}
