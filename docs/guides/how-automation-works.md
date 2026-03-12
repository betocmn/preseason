# How Automation Works

## Overview

Production automation is now the benchmark runner. There is one cron-facing
entry point:

- `/api/cron/benchmark-run`

The removed `/api/cron/run` and `/api/cron/settle` routes are gone along with
the old exploration pipeline.

## File Structure

```text
src/app/api/cron/benchmark-run/route.ts
src/server/llm/benchmark/runner.ts
src/server/llm/benchmark/parser.ts
src/server/llm/benchmark/prompt-builder.ts
src/server/llm/benchmark/tool-resolver.ts
src/server/llm/benchmark/qc.ts
```

## End-to-End Flow

1. Cron authenticates with `Authorization: Bearer <CRON_SECRET>`.
2. The route loads the newest `active` benchmark season.
3. `runBenchmark(seasonId, scheduledFor)` creates or reuses the run for that
   `(season, date)` pair.
4. The runner claims execution, or resumes/returns an in-flight run safely.
5. Active benchmark cases are loaded from the frozen season panel.
6. Each case builds a benchmark prompt from the frozen prompt version and its
   eligible categories.
7. The LLM service executes the case and stores a `benchmark_case_result`.
8. The strict parser extracts one decision per eligible category and stores
   `benchmark_case_decision` rows.
9. Unknown tool names go to `tool_candidate` for manual review.
10. QC is evaluated and the run finishes as `completed`, `failed`, or
    `qc_failed`.
11. Admins publish passing runs manually from the benchmark admin UI.

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
- `docs/guides/how-to-manually-test-automation-locally.md`
