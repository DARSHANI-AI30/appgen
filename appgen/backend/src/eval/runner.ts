import { runPipeline } from "../pipeline.js";
import { writeFileSync } from "fs";

interface EvalCase {
  id: string;
  category: "real" | "edge";
  subcategory?: "vague" | "conflicting" | "incomplete";
  prompt: string;
}

interface EvalResult {
  id: string;
  category: string;
  subcategory?: string;
  prompt: string;
  success: boolean;
  retries: number;
  failure_types: string[];
  latency_ms: number;
  repair_applied: boolean;
  entities_count: number;
  endpoints_count: number;
  pages_count: number;
  error?: string;
}

const EVAL_CASES: EvalCase[] = [
  // ── 10 Real Product Prompts ──────────────────────────────────────────────
  {
    id: "real_01",
    category: "real",
    prompt:
      "Build a CRM with login, contacts, deals pipeline, dashboard, role-based access for admin and sales reps. Admins can see analytics and manage users.",
  },
  {
    id: "real_02",
    category: "real",
    prompt:
      "Create a salon booking app where customers can book appointments, staff can manage schedules, and admins can see revenue reports. Include payments.",
  },
  {
    id: "real_03",
    category: "real",
    prompt:
      "Build a project management tool like Jira with tasks, sprints, projects, comments, and user assignments. Teams can have multiple projects.",
  },
  {
    id: "real_04",
    category: "real",
    prompt:
      "Create an e-commerce platform with products, categories, cart, orders, and payments. Sellers can list products and buyers can checkout.",
  },
  {
    id: "real_05",
    category: "real",
    prompt:
      "Build a blog platform where authors can write posts, readers can comment, and admins can moderate. Support tags, categories, and a premium subscription.",
  },
  {
    id: "real_06",
    category: "real",
    prompt:
      "Create a hospital management system with patients, doctors, appointments, prescriptions, and billing. Doctors can see patient history.",
  },
  {
    id: "real_07",
    category: "real",
    prompt:
      "Build a real estate listing platform with properties, agents, inquiries, and a search system. Agents can manage listings and respond to inquiries.",
  },
  {
    id: "real_08",
    category: "real",
    prompt:
      "Create a learning management system with courses, lessons, quizzes, enrollments, and certificates. Instructors create content, students learn.",
  },
  {
    id: "real_09",
    category: "real",
    prompt:
      "Build a food delivery app with restaurants, menus, orders, delivery tracking, and driver management. Include ratings and reviews.",
  },
  {
    id: "real_10",
    category: "real",
    prompt:
      "Create an HR management system with employees, departments, leave requests, payroll, and performance reviews. HR managers approve leaves.",
  },

  // ── 10 Edge Cases ────────────────────────────────────────────────────────
  {
    id: "edge_vague_01",
    category: "edge",
    subcategory: "vague",
    prompt: "Build me an app",
  },
  {
    id: "edge_vague_02",
    category: "edge",
    subcategory: "vague",
    prompt: "I need a website for my business",
  },
  {
    id: "edge_vague_03",
    category: "edge",
    subcategory: "vague",
    prompt: "Make something for managing stuff online",
  },
  {
    id: "edge_conflict_01",
    category: "edge",
    subcategory: "conflicting",
    prompt:
      "Build an app where everyone is an admin but also regular users cannot see any admin features. All users must be able to do everything but nothing should be public.",
  },
  {
    id: "edge_conflict_02",
    category: "edge",
    subcategory: "conflicting",
    prompt:
      "Create a free platform with premium features but no payments. Everything should be unlimited but also have usage limits.",
  },
  {
    id: "edge_conflict_03",
    category: "edge",
    subcategory: "conflicting",
    prompt:
      "Build a social network that is completely private with no user profiles but users can follow each other and see public posts.",
  },
  {
    id: "edge_incomplete_01",
    category: "edge",
    subcategory: "incomplete",
    prompt: "Build a marketplace",
  },
  {
    id: "edge_incomplete_02",
    category: "edge",
    subcategory: "incomplete",
    prompt: "Create a dashboard with analytics",
  },
  {
    id: "edge_incomplete_03",
    category: "edge",
    subcategory: "incomplete",
    prompt: "Make an app with login and a database",
  },
  {
    id: "edge_incomplete_04",
    category: "edge",
    subcategory: "incomplete",
    prompt: "Build something with payments and users",
  },
];

async function runEval() {
  console.log("🧪 Starting Evaluation Run");
  console.log(`   Cases: ${EVAL_CASES.length} (${EVAL_CASES.filter((c) => c.category === "real").length} real, ${EVAL_CASES.filter((c) => c.category === "edge").length} edge)\n`);

  const results: EvalResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const evalCase of EVAL_CASES) {
    console.log(`\n[${evalCase.id}] ${evalCase.category.toUpperCase()}${evalCase.subcategory ? `/${evalCase.subcategory}` : ""}`);
    console.log(`   Prompt: "${evalCase.prompt.slice(0, 70)}..."`);

    const start = Date.now();
    try {
      const result = await runPipeline(evalCase.prompt);

      const evalResult: EvalResult = {
        id: evalCase.id,
        category: evalCase.category,
        subcategory: evalCase.subcategory,
        prompt: evalCase.prompt,
        success: result.validation.passed,
        retries: result.meta.total_retries,
        failure_types: result.validation.errors.map((e) => e.layer),
        latency_ms: result.meta.total_latency_ms,
        repair_applied: result.validation.repairs.length > 0,
        entities_count: result.design.entities.length,
        endpoints_count: result.schema.api_schema.endpoints.length,
        pages_count: result.schema.ui_schema.pages.length,
      };

      results.push(evalResult);
      if (result.validation.passed) {
        passed++;
        console.log(`   ✅ PASSED — ${result.meta.total_latency_ms}ms, ${result.schema.api_schema.endpoints.length} endpoints, ${result.schema.db_schema.tables.length} tables`);
      } else {
        failed++;
        console.log(`   ⚠️  PARTIAL — ${result.validation.errors.length} unresolved errors`);
      }
    } catch (err: any) {
      failed++;
      results.push({
        id: evalCase.id,
        category: evalCase.category,
        subcategory: evalCase.subcategory,
        prompt: evalCase.prompt,
        success: false,
        retries: 0,
        failure_types: ["pipeline_error"],
        latency_ms: Date.now() - start,
        repair_applied: false,
        entities_count: 0,
        endpoints_count: 0,
        pages_count: 0,
        error: err.message,
      });
      console.log(`   ❌ FAILED — ${err.message}`);
    }

    // Small delay between cases to avoid rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  const successRate = ((passed / EVAL_CASES.length) * 100).toFixed(1);
  const avgLatency = Math.round(results.reduce((a, r) => a + r.latency_ms, 0) / results.length);
  const avgRetries = (results.reduce((a, r) => a + r.retries, 0) / results.length).toFixed(2);
  const repairRate = ((results.filter((r) => r.repair_applied).length / results.length) * 100).toFixed(1);

  console.log("\n" + "═".repeat(60));
  console.log("📊 EVALUATION RESULTS");
  console.log("═".repeat(60));
  console.log(`Success Rate:     ${successRate}% (${passed}/${EVAL_CASES.length})`);
  console.log(`Avg Latency:      ${avgLatency}ms`);
  console.log(`Avg Retries:      ${avgRetries}`);
  console.log(`Repair Rate:      ${repairRate}%`);
  console.log("");
  console.log("By Category:");
  const realResults = results.filter((r) => r.category === "real");
  const edgeResults = results.filter((r) => r.category === "edge");
  console.log(`  Real prompts:   ${realResults.filter((r) => r.success).length}/${realResults.length} passed`);
  console.log(`  Edge cases:     ${edgeResults.filter((r) => r.success).length}/${edgeResults.length} passed`);

  const failureTypes = results.flatMap((r) => r.failure_types);
  const failureCounts: Record<string, number> = {};
  for (const ft of failureTypes) {
    failureCounts[ft] = (failureCounts[ft] || 0) + 1;
  }
  if (Object.keys(failureCounts).length > 0) {
    console.log("\nFailure Types:");
    for (const [type, count] of Object.entries(failureCounts)) {
      console.log(`  ${type}: ${count}`);
    }
  }

  const report = {
    run_date: new Date().toISOString(),
    summary: { success_rate: successRate, avg_latency_ms: avgLatency, avg_retries: avgRetries, repair_rate: repairRate, passed, failed, total: EVAL_CASES.length },
    results,
  };

  writeFileSync("eval-report.json", JSON.stringify(report, null, 2));
  console.log("\n📄 Full report saved to eval-report.json");
}

runEval().catch(console.error);
