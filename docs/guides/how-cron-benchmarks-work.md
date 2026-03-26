# How Cron Benchmarks Work

## TL;DR

This is the repo's scheduled evaluation pipeline for benchmark runs and match
batches.

It does two things:

- Runs the active benchmark season against its frozen prompt and model panel
- Claims and executes pending match batches for head-to-head comparisons

The goal is to keep benchmark results and match outcomes moving forward without
manual triggering, while keeping runs idempotent, authenticated, and auditable.

## Overview

Production cron benchmarks now have two cron-facing entry points:

- `/api/cron/benchmark-run`
- `/api/cron/match-run`

The removed `/api/cron/run` and `/api/cron/settle` routes are gone along with
the old exploration pipeline.

## Schedule

The deployed schedule lives in `vercel.json`.

| Route | What runs | When | Cron |
| --- | --- | --- | --- |
| `/api/cron/benchmark-run` | Resumes oldest unfinished benchmark work (or starts today) for the newest active season | Every 10 minutes | `*/10 * * * *` |
| `/api/cron/match-run` | Claims the next pending, failed, or stale running match batch and executes it | Every 15 minutes | `*/15 * * * *` |

In practice:

- Benchmark cron assembles one logical daily run across many short invocations
- Match cron is the background dispatcher that keeps queued match batches moving

## File Structure

```text
src/app/api/cron/benchmark-run/route.ts
src/app/api/cron/match-run/route.ts
src/server/llm/benchmark/runner.ts
src/server/llm/benchmark/parser.ts
src/server/llm/benchmark/prompt-builder.ts
src/server/llm/benchmark/tool-resolver.ts
src/server/llm/benchmark/qc.ts
src/server/llm/match/batches.ts
src/server/llm/match/runner.ts
src/server/llm/match/parser.ts
```

## End-to-End Flow

1. Cron authenticates with `Authorization: Bearer <CRON_SECRET>`.
2. The route loads the newest `active` benchmark season.
3. Benchmark cron targets the oldest unfinished run first and only starts a new
   UTC day when no unfinished work exists. If that run is already healthy
   `running`, cron returns the in-flight summary; if it is stale, the runner
   reclaims it.
4. `runBenchmark(seasonId, scheduledFor)` creates or reuses the run for that
   `(season, date)` pair.
5. The runner claims execution, or resumes/returns an in-flight run safely.
6. Active benchmark cases are loaded from the frozen season panel.
7. A single invocation processes only `serverSettings.benchmark.casesPerCronInvocation`
   cases (default `8`) from `src/constants/server-settings.ts` and then yields.
8. Each case builds a benchmark prompt from the frozen prompt version and its
   eligible categories.
9. The LLM service executes the case and stores a `benchmark_case_result`.
10. The strict parser extracts one decision per eligible category and stores
   `benchmark_case_decision` rows.
11. Unknown tool names go to `tool_candidate` for manual review.
12. If work remains, the run is set back to `pending` so the next cron
    invocation can continue; QC terminal status is evaluated only when all
    cases are done.
13. QC is evaluated and the run finishes as `completed`, `failed`, or
    `qc_failed`.
14. Admins publish passing runs manually from the benchmark admin UI.

## Match Dispatch Flow

1. Admin workflows create pending match batches.
2. Cron authenticates with `Authorization: Bearer <CRON_SECRET>`.
3. `GET /api/cron/match-run` claims the next pending, failed, or stale running
   batch.
4. `runMatchBatch()` executes the batch against the frozen model snapshots for
   that season.
5. Parsed match evaluations are stored and the batch is marked `completed` or
   `failed`.

## Runner Guarantees

### Idempotent by Date

Runs are unique on `(season_id, scheduled_for)`. Re-triggering the cron for the
same date resumes the existing run instead of creating duplicates.

### Safe Reclaim of Stale Work

`runBenchmark` can reclaim a stale `running` record if the worker stops
heartbeating. The reclaim logic is tested so stale workers cannot write terminal
results after another worker has taken over.

### Strict Parsing

The benchmark parser only accepts the structured appendix contract. There is no
heuristic fallback path in production.

### Manual Publication

Completing a run does not publish it automatically. Publication is a separate
admin action after QC review.

## Stored Data

### `benchmark_run`

- Run status and trigger
- Scheduled date
- Expected/completed/failed case counts
- QC summary and error log

### `benchmark_case_result`

- Raw response and parsed appendix payload
- Requested and returned model IDs
- Token counts and latency
- Parser version and error message

### `benchmark_case_decision`

- One category-level decision per eligible category
- Chosen tool or `none` / `invalid`
- Resolution status for unknown tool names

## Environment

- `DATABASE_URL`
- `OPENROUTER_API_KEY`
- `CRON_SECRET`

## Related Docs

- `docs/guides/how-benchmarks-work.md`
- `docs/guides/how-rankings-work.md`
- `docs/guides/how-to-manually-test-cron-benchmarks-locally.md`
