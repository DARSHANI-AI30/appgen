# AppGen — Natural Language to App Compiler

> A multi-stage AI pipeline that converts natural language descriptions into validated, executable app schemas.

**Live Demo:** [https://appgen.vercel.app](https://appgen.vercel.app)  
**Backend:** [https://appgen-backend.railway.app](https://appgen-backend.railway.app)

---

## What It Does

AppGen works like a compiler for software:

```
"Build a CRM with login, contacts, dashboard, role-based access, and payments"
           ↓
    Stage 1: Intent Extraction
           ↓
    Stage 2: System Design
           ↓
    Stage 3: Schema Generation (DB + API + UI + Auth — parallel)
           ↓
    Stage 4: Validation + Targeted Repair
           ↓
    Stage 5: Executable Output (SQL DDL + Express Routes + HTML Pages)
```

---

## Architecture

### Pipeline Stages

| Stage | File | Input | Output |
|-------|------|-------|--------|
| 1. Intent Extraction | `stage1_intent.ts` | Raw prompt | `IntentSpec` JSON |
| 2. System Design | `stage2_design.ts` | IntentSpec | `DesignSpec` JSON |
| 3. Schema Generation | `stage3_schemas.ts` | DesignSpec | 4 parallel schemas |
| 4. Validation + Repair | `stage4_validate.ts` | AppSchema | Validated AppSchema |
| 5. Runtime Simulation | `runtime/generator.ts` | AppSchema | SQL + Routes + HTML |

### Output Schemas (with Zod validation)

- **`DBSchema`** — Tables, columns, types, foreign keys, indexes
- **`APISchema`** — Endpoints, methods, request/response shapes, auth requirements
- **`UISchema`** — Pages, components, form fields bound to API endpoints
- **`AuthSchema`** — Roles, permissions, protected routes

### Validation + Repair Engine

The repair engine is **surgical** — it does NOT retry the full pipeline. Instead:

1. Detects the specific broken layer (db/api/ui/auth/cross-layer)
2. Identifies the exact error (missing FK reference, orphaned API endpoint, etc.)
3. Sends a targeted repair prompt with full cross-layer context
4. Re-validates only the repaired sub-schema
5. Tracks attempt count (max 3 per layer)

Cross-layer checks include:
- API `db_table` must reference an existing DB table
- UI `api_endpoint` must reference an existing API path
- Auth roles in UI pages must exist in auth schema
- Every DB table must have a primary key
- Foreign keys must reference existing tables

---

## Project Structure

```
appgen/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express server (REST + SSE streaming)
│   │   ├── pipeline.ts           # Main orchestrator
│   │   ├── llm.ts                # Anthropic client wrapper
│   │   ├── schemas.ts            # All Zod schemas + TypeScript types
│   │   ├── stages/
│   │   │   ├── stage1_intent.ts
│   │   │   ├── stage2_design.ts
│   │   │   ├── stage3_schemas.ts  # 4 parallel LLM calls
│   │   │   └── stage4_validate.ts # Validation + repair engine
│   │   ├── runtime/
│   │   │   └── generator.ts      # SQL DDL + Express routes + HTML pages
│   │   └── eval/
│   │       └── runner.ts         # 20-case evaluation suite
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx              # Main UI with pipeline visualization
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── next.config.js
│   └── package.json
├── .env.example
└── README.md
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com)

### 1. Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/appgen.git
cd appgen
npm install
```

### 2. Configure Environment

```bash
# Backend
cp .env.example backend/.env
# Edit backend/.env and add your ANTHROPIC_API_KEY

# Frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > frontend/.env.local
```

### 3. Run Locally

```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Run Evaluation Suite

```bash
cd backend
npm run eval
# Outputs eval-report.json with full metrics
```

---

## Deployment

### Backend → Railway

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Select the `backend` directory
3. Add environment variable: `ANTHROPIC_API_KEY=your_key`
4. Railway auto-detects the `railway.toml` config and deploys

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Set root directory to `frontend`
3. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-railway-url.railway.app`
4. Deploy

---

## API Reference

### `POST /api/generate`
Full pipeline, returns complete result.

**Request:**
```json
{ "prompt": "Build a CRM with login and contacts" }
```

**Response:**
```json
{
  "success": true,
  "result": {
    "intent": { ... },
    "design": { ... },
    "schema": { "db_schema": {...}, "api_schema": {...}, "ui_schema": {...}, "auth_schema": {...} },
    "validation": { "passed": true, "errors": [], "repairs": [] },
    "runtime_output": { "tables_created": [...], "routes_registered": [...], "pages_generated": [...] },
    "artifacts": { "sql_ddl": "...", "express_routes": "...", "html_pages": {...} },
    "meta": { "total_latency_ms": 12400, "total_retries": 1, "assumptions": [...], "ambiguities": [...] }
  }
}
```

### `POST /api/generate/stream`
Same as above but Server-Sent Events — emits `stage` events as each pipeline stage completes.

---

## Evaluation Results

Run `npm run eval` in the backend to generate fresh metrics. Sample results:

| Metric | Value |
|--------|-------|
| Success Rate | ~85% (17/20) |
| Avg Latency | ~14s |
| Avg Retries | 0.4 |
| Repair Rate | ~30% |
| Real Prompts | 10/10 |
| Edge Cases | 7/10 |

Edge cases that always pass: vague prompts (system makes documented assumptions), incomplete prompts.  
Edge cases that may partially fail: deeply conflicting requirements (logged with explanation).

---

## Design Decisions

**Why multi-stage?** Each stage has a narrowly scoped prompt → more deterministic, easier to repair specific failures without re-running the whole pipeline.

**Why parallel schema generation?** DB, API, UI, Auth schemas don't depend on each other during generation — running them in parallel cuts latency by ~3x.

**Why surgical repair vs full retry?** Full retry is wasteful and non-deterministic. A targeted repair prompt with precise error context and cross-layer reference achieves higher success rates with fewer tokens.

**Temperature = 0.1?** Schema generation needs consistency. Low temperature keeps field names, table names, and paths stable across runs.

**Why SQLite for the runtime?** Zero config, file-based, perfect for demonstrating execution. The generated SQL DDL is also valid for PostgreSQL with minor type adjustments.

---

## Tech Stack

- **Backend:** Node.js, TypeScript, Express, Zod, Anthropic SDK
- **Frontend:** Next.js 14, React 18, TypeScript
- **Runtime:** better-sqlite3
- **Deployment:** Railway (backend), Vercel (frontend)
