# Architecture

This document summarizes how Preseason turns scheduled LLM generations into
public, auditable rankings.

## High-Level System

```text
                    ┌─────────────────────────────────┐
                    │  Prompt Corpus + Model Panel    │
                    │  (frozen into active season)    │
                    └───────────────┬─────────────────┘
                                    │
                                    ▼
┌──────────────────────┐   run cases   ┌──────────────────────────┐
│ Cron Trigger         │──────────────▶│ LLM Gateway (OpenRouter) │
│ /api/cron/benchmark  │               └──────────────┬───────────┘
└──────────┬───────────┘                              │
           │                                          ▼
           │                                ┌──────────────────────┐
           │                                │ Strict JSON Appendix │
           │                                │ parser + validation  │
           │                                └──────────────┬───────┘
           │                                               │
           │                                 decisions     ▼
           │                                ┌──────────────────────┐
           └───────────────────────────────▶│ Postgres benchmark   │
                                            │ runs/cases/decisions │
                                            └──────────────┬───────┘
                                                           │
                                                           ▼
                                            ┌────────────────────────┐
                                            │ Public ranking routers │
                                            │ + admin review screens │
                                            └────────────────────────┘
```

## Runtime Surfaces

- Public app routes under `src/app/(public)/...`
- Admin routes under `src/app/admin/...`
- Provider/review routes under `src/app/provider/...`
- API layer through tRPC routers in `src/server/api/routers/...`
- Scheduled benchmark entrypoint at `/api/cron/benchmark-run`

## Core Data Flow

1. Prompt versions and model snapshots are frozen into an active benchmark
   season.
2. Cron creates or resumes the run for that season/day and executes missing
   prompt × model cases.
3. Each model response must include a machine-readable appendix.
4. Parser writes case results and category-level case decisions (`tool`,
   `none`, `invalid`).
5. Unknown tool names enter the candidate queue for admin review.
6. QC gates decide whether a run can be published.
7. Public ranking endpoints query published benchmark decisions only.

## Main Modules

### Prompt + Model Freezing

- `src/server/llm/benchmark/prompt-freezer.ts`
- `src/server/llm/benchmark/model-snapshotter.ts`
- `src/server/db/prompt-corpus.ts`

These modules keep benchmark inputs immutable once attached to a season.

### Benchmark Execution

- `src/server/llm/benchmark/runner.ts`
- `src/server/llm/benchmark/prompt-builder.ts`
- `src/server/llm/service/openrouter-client.ts`

Execution is idempotent by `(season, run_date)`, so retries do not duplicate
completed case results.

### Parsing + Resolution

- `src/server/llm/benchmark/parser.ts`
- `src/server/llm/benchmark/tool-normalization.ts`
- `src/server/llm/benchmark/tool-candidate-reviewer.ts`

The parser is strict by design; malformed appendix output is recorded as
`invalid` rather than heuristically repaired.

### Scoring + Public Reads

- `src/server/llm/benchmark/scoring.ts`
- `src/server/api/routers/benchmark-ranking.ts`
- `src/server/api/routers/benchmark-public.ts`

Scores are computed over published benchmark windows (`run_day`, `trailing_7d`,
`trailing_28d`, `season_to_date`) with confidence intervals and minimum
coverage thresholds.

### Persistence Layer

- Schema: `src/server/db/schema.ts`
- Migrations: `drizzle/`
- Seeders: `src/server/db/seed.ts`, `seed-dev-data.ts`, `seed-benchmark-data.ts`

All benchmark tables are namespaced with `preseason_*`.

## Operational Notes

- Lint/typecheck/test are required in CI (`.github/workflows/ci.yml`).
- Run publication is QC-gated to avoid shipping thin or invalid data.
- Production requires cron scheduling with `CRON_SECRET`.
- Self-hosting guidance lives in `docs/SELF_HOSTING.md`.
