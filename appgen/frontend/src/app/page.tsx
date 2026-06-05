"use client";
import React, { useState, useRef, useCallback } from "react";


// ── Types ─────────────────────────────────────────────────────────────────────
interface StageData {
  intent?: any;
  design?: any;
  schemas?: any;
  validation?: any;
  runtime?: any;
}


interface PipelineResult {
  intent: object;
  design: object;
  schema: object;
  validation: { passed: boolean; errors: any[]; repairs: any[] };
  runtime_output: { tables_created: string[]; routes_registered: string[]; pages_generated: string[] };
  artifacts: { sql_ddl: string; express_routes: string; html_pages: Record<string, string> };
  meta: { total_latency_ms: number; stage_latencies: Record<string, number>; total_retries: number; assumptions: string[]; ambiguities: string[] };
}

type TabKey = "intent" | "design" | "schemas" | "validation" | "runtime" | "sql" | "routes" | "full";

const STAGES = [
  { key: "intent", label: "Intent Extraction", icon: "01", desc: "Parsing natural language" },
  { key: "design", label: "System Design", icon: "02", desc: "Architecting entities & flows" },
  { key: "schemas", label: "Schema Generation", icon: "03", desc: "DB · API · UI · Auth (parallel)" },
  { key: "validation", label: "Validation & Repair", icon: "04", desc: "Cross-layer consistency check" },
  { key: "runtime", label: "Runtime Simulation", icon: "05", desc: "Generating executable output" },
];

const EXAMPLE_PROMPTS = [
  "Build a CRM with login, contacts, deals pipeline, dashboard, and role-based access. Admins see analytics.",
  "Create a salon booking app with staff scheduling, customer appointments, and Stripe payments.",
  "Build a project management tool with tasks, sprints, comments, and team assignments.",
  "Create an e-learning platform with courses, lessons, quizzes, progress tracking, and certificates.",
  "Build a food delivery app with restaurants, menus, orders, and driver management.",
];

// ── JSON Viewer ───────────────────────────────────────────────────────────────
function JSONViewer({ data, maxHeight = "500px" }: { data: unknown; maxHeight?: string }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());


  function renderValue(val: unknown, path = "", depth = 0): React.ReactNode {
    if (val === null) return <span style={{ color: "#ef4444" }}>null</span>;
    if (typeof val === "boolean") return <span style={{ color: "#f59e0b" }}>{val.toString()}</span>;
    if (typeof val === "number") return <span style={{ color: "#60a5fa" }}>{val}</span>;
    if (typeof val === "string") {
      const display = val.length > 120 ? val.slice(0, 120) + "…" : val;
      return <span style={{ color: "#86efac" }}>"{display}"</span>;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return <span style={{ color: "#94a3b8" }}>[]</span>;
      const isCollapsed = collapsed.has(path);
      return (
        <span>
          <button onClick={() => setCollapsed(s => { const n = new Set(s); isCollapsed ? n.delete(path) : n.add(path); return n; })}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "11px", padding: "0 4px" }}>
            {isCollapsed ? "▶" : "▼"}
          </button>
          {isCollapsed ? (
            <span style={{ color: "#94a3b8" }}>[{val.length} items]</span>
          ) : (
            <span>
              {"["}<br />
              {val.map((item, i) => (
                <span key={i} style={{ display: "block", paddingLeft: `${(depth + 1) * 16}px` }}>
                  {renderValue(item, `${path}[${i}]`, depth + 1)}
                  {i < val.length - 1 && <span style={{ color: "#475569" }}>,</span>}
                </span>
              ))}
              <span style={{ paddingLeft: `${depth * 16}px` }}>{"]"}</span>
            </span>
          )}
        </span>
      );
    }
    if (typeof val === "object") {
      const keys = Object.keys(val as object);
      if (keys.length === 0) return <span style={{ color: "#94a3b8" }}>{"{}"}</span>;
      const isCollapsed = collapsed.has(path);
      return (
        <span>
          <button onClick={() => setCollapsed(s => { const n = new Set(s); isCollapsed ? n.delete(path) : n.add(path); return n; })}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "11px", padding: "0 4px" }}>
            {isCollapsed ? "▶" : "▼"}
          </button>
          {isCollapsed ? (
            <span style={{ color: "#94a3b8" }}>{`{${keys.length} keys}`}</span>
          ) : (
            <span>
              {"{"}<br />
              {keys.map((k, i) => (
                <span key={k} style={{ display: "block", paddingLeft: `${(depth + 1) * 16}px` }}>
                  <span style={{ color: "#c084fc" }}>"{k}"</span>
                  <span style={{ color: "#475569" }}>: </span>
                  {renderValue((val as any)[k], `${path}.${k}`, depth + 1)}
                  {i < keys.length - 1 && <span style={{ color: "#475569" }}>,</span>}
                </span>
              ))}
              <span style={{ paddingLeft: `${depth * 16}px` }}>{"}"}</span>
            </span>
          )}
        </span>
      );
    }
    return <span>{String(val)}</span>;
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "16px", fontFamily: "var(--mono)", fontSize: "12px", lineHeight: "1.7", overflowY: "auto", maxHeight, overflowX: "auto" }}>
      {renderValue(data)}
    </div>
  );
}

// ── Code Block ────────────────────────────────────────────────────────────────
function CodeBlock({ code, language = "sql" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{ position: "relative", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{language}</span>
        <button onClick={copy} style={{ background: "var(--border)", border: "none", borderRadius: 4, padding: "4px 10px", color: copied ? "var(--green)" : "var(--text2)", cursor: "pointer", fontSize: "12px", fontFamily: "var(--mono)" }}>
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      <pre style={{ margin: 0, padding: "16px", overflowX: "auto", maxHeight: "500px", overflowY: "auto", fontFamily: "var(--mono)", fontSize: "12px", lineHeight: "1.7", color: "var(--text)" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ children, color = "blue" }: { children: React.ReactNode; color?: "blue" | "green" | "amber" | "red" | "gray" }) {

  const colors = { blue: "#1d4ed8", green: "#15803d", amber: "#92400e", red: "#991b1b", gray: "#374151" };
  const textColors = { blue: "#93c5fd", green: "#86efac", amber: "#fcd34d", red: "#fca5a5", gray: "#9ca3af" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 4, background: colors[color], color: textColors[color], fontSize: "11px", fontFamily: "var(--mono)", fontWeight: 700, letterSpacing: "0.05em" }}>
      {children}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("intent");
  const [completedStages, setCompletedStages] = useState<Set<string>>(new Set());
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [stageData, setStageData] = useState<StageData>({});
  const abortRef = useRef<AbortController | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setCompletedStages(new Set());
    setActiveStage("intent");
    setStageData({});

    abortRef.current = new AbortController();

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${apiUrl}/api/generate/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) continue;
          if (!line.startsWith("data: ")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.stage) {
              setCompletedStages(prev => {
                const next = new Set(prev);
                next.add(parsed.stage);
                return next;
              });
              setStageData(prev => ({ ...prev, [parsed.stage]: parsed.data }));
              const stageOrder = ["intent", "design", "schemas", "validation", "runtime"];
              const idx = stageOrder.indexOf(parsed.stage);
              if (idx < stageOrder.length - 1) setActiveStage(stageOrder[idx + 1]);
            }
            if (parsed.result) {
              setResult(parsed.result);
              setActiveStage(null);
              setCompletedStages(new Set(["intent", "design", "schemas", "validation", "runtime"]));
            }
            if (parsed.message && !parsed.result) {
              // start event
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        // Fallback to regular POST if SSE fails
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
          const res = await fetch(`${apiUrl}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          });
          const data = await res.json();
          if (data.success) {
            setResult(data.result);
            setCompletedStages(new Set(["intent", "design", "schemas", "validation", "runtime"]));
          } else {
            setError(data.error || "Pipeline failed");
          }
        } catch (err2: any) {
          setError(err2.message);
        }
      }
    } finally {
      setLoading(false);
      setActiveStage(null);
    }
  }, [prompt, loading]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "intent", label: "Intent" },
  { key: "design", label: "Design" },
  { key: "schemas", label: "Schemas" },
  { key: "validation", label: "Validation" },
    { key: "runtime", label: "Runtime" },
    { key: "sql", label: "SQL DDL" },
    { key: "routes", label: "API Routes" },
    { key: "full", label: "Full JSON" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <header style={{ borderBottom: "1px solid var(--border)", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, background: "var(--accent)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4L8 2L14 4V8C14 11.5 11 13.5 8 14.5C5 13.5 2 11.5 2 8V4Z" stroke="white" strokeWidth="1.5" fill="none" /><path d="M5 8L7 10L11 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </div>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: 15, letterSpacing: "0.05em" }}>AppGen</span>
          <Badge color="blue">v1.0</Badge>
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <a href="https://github.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--text2)", textDecoration: "none", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" /></svg>
            GitHub
          </a>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 32px" }}>
        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 42px)", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2, marginBottom: 12 }}>
            Natural Language <span style={{ color: "var(--accent)" }}>→</span> App Schema
          </h1>
          <p style={{ color: "var(--text2)", fontSize: 16, maxWidth: 560, margin: "0 auto" }}>
            A multi-stage AI compiler: intent extraction → system design → schema generation → validation → executable output.
          </p>
        </div>

        {/* Prompt Input */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, marginBottom: 32 }}>
          <label style={{ display: "block", fontSize: 12, fontFamily: "var(--mono)", color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>
            Describe your app
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
            placeholder="e.g. Build a CRM with login, contacts, deals pipeline, role-based access for admins and sales reps. Admins can see analytics and manage users."
            rows={4}
            style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", color: "var(--text)", fontSize: 14, fontFamily: "var(--sans)", resize: "vertical", outline: "none", lineHeight: 1.6 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {EXAMPLE_PROMPTS.slice(0, 3).map((p, i) => (
                <button key={i} onClick={() => setPrompt(p)} style={{ background: "var(--surface2)", border: "1px solid var(--border2)", borderRadius: 6, padding: "4px 10px", color: "var(--text2)", cursor: "pointer", fontSize: 12 }}>
                  Example {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim()}
              style={{ background: loading ? "var(--border)" : "var(--accent)", border: "none", borderRadius: 8, padding: "10px 28px", color: "white", cursor: loading || !prompt.trim() ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s" }}
            >
              {loading ? (
                <>
                  <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" }} />
                  Generating…
                </>
              ) : (
                <>Generate ⌘↵</>
              )}
            </button>
          </div>
        </div>

        {/* Pipeline Stages */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 32 }}>
          {STAGES.map((stage) => {
            const done = completedStages.has(stage.key);
            const active = activeStage === stage.key;
            return (
              <div key={stage.key} style={{ background: done ? "rgba(59,130,246,0.08)" : active ? "rgba(59,130,246,0.05)" : "var(--surface)", border: `1px solid ${done ? "var(--accent)" : active ? "rgba(59,130,246,0.4)" : "var(--border)"}`, borderRadius: 8, padding: "12px 14px", transition: "all 0.3s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: done ? "var(--accent)" : "var(--text3)", fontWeight: 700 }}>{stage.icon}</span>
                  {done && <span style={{ color: "var(--green)", fontSize: 12 }}>✓</span>}
                  {active && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", display: "inline-block", animation: "pulse 1s ease-in-out infinite" }} />}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: done ? "var(--text)" : "var(--text2)", marginBottom: 2 }}>{stage.label}</div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>{stage.desc}</div>
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "16px 20px", marginBottom: 24, color: "#fca5a5" }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div>
            {/* Metrics Bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Total Latency", value: `${(result.meta.total_latency_ms / 1000).toFixed(1)}s` },
                { label: "DB Tables", value: (result.schema as any).db_schema?.tables?.length ?? 0 },
                { label: "API Endpoints", value: (result.schema as any).api_schema?.endpoints?.length ?? 0 },
                { label: "UI Pages", value: (result.schema as any).ui_schema?.pages?.length ?? 0 },
                { label: "Repairs", value: result.validation.repairs.length },
                { label: "Validation", value: result.validation.passed ? "✓ Passed" : "⚠ Issues", color: result.validation.passed ? "var(--green)" : "var(--amber)" },
              ].map((m) => (
                <div key={m.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: (m as any).color || "var(--text)", fontFamily: "var(--mono)" }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Assumptions & Ambiguities */}
            {(result.meta.assumptions.length > 0 || result.meta.ambiguities.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                {result.meta.assumptions.length > 0 && (
                  <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--amber)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Assumptions Made</div>
                    {result.meta.assumptions.map((a, i) => <div key={i} style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4 }}>· {a}</div>)}
                  </div>
                )}
                {result.meta.ambiguities.length > 0 && (
                  <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--red)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>Ambiguities Detected</div>
                    {result.meta.ambiguities.map((a, i) => <div key={i} style={{ fontSize: 12, color: "var(--text2)", marginBottom: 4 }}>· {a}</div>)}
                  </div>
                )}
              </div>
            )}

            {/* Tab Nav */}
            <div style={{ display: "flex", gap: 2, marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 0, overflowX: "auto" }}>
              {tabs.map((tab) => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{ background: "none", border: "none", borderBottom: `2px solid ${activeTab === tab.key ? "var(--accent)" : "transparent"}`, padding: "8px 16px", color: activeTab === tab.key ? "var(--accent2)" : "var(--text2)", cursor: "pointer", fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 400, whiteSpace: "nowrap", transition: "all 0.15s" }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div>
              {activeTab === "intent" && <JSONViewer data={result.intent} />}
              {activeTab === "design" && <JSONViewer data={result.design} />}
              {activeTab === "schemas" && <JSONViewer data={result.schema} />}
              {activeTab === "validation" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ background: result.validation.passed ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)", border: `1px solid ${result.validation.passed ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)"}`, borderRadius: 8, padding: 16 }}>
                    <strong style={{ color: result.validation.passed ? "var(--green)" : "var(--amber)" }}>
                      {result.validation.passed ? "✓ All validations passed" : `⚠ ${result.validation.errors.length} issue(s) remain`}
                    </strong>
                  </div>
                  {result.validation.repairs.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--text3)", marginBottom: 8, textTransform: "uppercase" }}>Repairs Applied ({result.validation.repairs.length})</div>
                      {result.validation.repairs.map((r: any, i: number) => (
                        <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 8, fontSize: 13 }}>
                          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                            <Badge color={r.success ? "green" : "red"}>{r.success ? "REPAIRED" : "FAILED"}</Badge>
                            <Badge color="gray">{r.layer}</Badge>
                            <Badge color="gray">attempt {r.attempt}</Badge>
                          </div>
                          <div style={{ color: "var(--text2)", fontSize: 12 }}>{r.error.slice(0, 200)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {result.validation.errors.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--text3)", marginBottom: 8, textTransform: "uppercase" }}>Remaining Errors</div>
                      {result.validation.errors.map((e: any, i: number) => (
                        <div key={i} style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: 12, marginBottom: 8, fontSize: 13 }}>
                          <Badge color="red">{e.layer}</Badge>
                          <span style={{ marginLeft: 8, color: "var(--text2)" }}>{e.path}: {e.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {activeTab === "runtime" && result.runtime_output && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  {[
                    { label: "Tables Created", items: result.runtime_output.tables_created, color: "blue" },
                    { label: "Routes Registered", items: result.runtime_output.routes_registered, color: "green" },
                    { label: "Pages Generated", items: result.runtime_output.pages_generated, color: "amber" },
                  ].map((section) => (
                    <div key={section.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
                      <div style={{ fontSize: 11, fontFamily: "var(--mono)", color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{section.label} ({section.items.length})</div>
                      {section.items.map((item, i) => (
                        <div key={i} style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text2)", padding: "4px 0", borderBottom: "1px solid var(--border)" }}>{item}</div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {activeTab === "sql" && result.artifacts?.sql_ddl && <CodeBlock code={result.artifacts.sql_ddl} language="sql" />}
              {activeTab === "routes" && result.artifacts?.express_routes && <CodeBlock code={result.artifacts.express_routes} language="typescript" />}
              {activeTab === "full" && <CodeBlock code={JSON.stringify(result, null, 2)} language="json" />}
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !result && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 40, textAlign: "center" }}>
            <div style={{ color: "var(--text2)", fontSize: 14 }}>Running pipeline… watch the stages above light up.</div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
