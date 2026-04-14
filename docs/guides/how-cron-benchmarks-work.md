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
| `/api/cron/benchmark-run` | Resumes oldest unfinished benchmark work or starts a fresh run when the configured cadence window opens for the newest active season | Every minute | `* * * * *` |
| `/api/cron/match-run` | Claims the next pending, failed, or stale running match batch and executes it | Every 15 minutes | `*/15 * * * *` |

In practice:

- Benchmark cron assembles one logical run per configured cadence window across many short invocations
- Benchmark invocations are expected to overlap and safely claim different cases
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
   run when no unfinished work exists and
   `serverSettings.benchmark.newRunIntervalHours` has elapsed since the latest
   run date.
4. `runBenchmark(seasonId, scheduledFor)` creates or reuses the run for that
   `(season, date)` pair.
5. Run initialization is serialized with a Postgres advisory lock so snapshot
   setup and legacy migration happen once.
6. The runner freezes `snapshotCaseIds`, backfills one `benchmark_case_result`
   row per case, and stores missing work as `pending`.
7. A single invocation claims up to
   `serverSettings.benchmark.casesPerCronInvocation` cases from
   `src/constants/server-settings.ts` and then yields. The default is `1`.
8. Case claiming uses `FOR UPDATE SKIP LOCKED` on `benchmark_case_result`, so
   overlapping invocations do not claim the same row.
9. Claim order is:
   - stale `running` rows
   - fresh `pending` rows
   - `failed` / `invalid_output` rows
10. Each claimed case builds a benchmark prompt from the frozen prompt version and its
   eligible categories.
11. The LLM service executes the case and updates that claimed
    `benchmark_case_result` row in place.
12. The strict parser extracts one decision per eligible category and stores
   `benchmark_case_decision` rows.
13. Unknown tool names go to `tool_candidate` for manual review.
14. If any case rows are still `pending` or `running`, the run stays `running`
    and waits for the next invocation.
15. QC is evaluated only when no non-terminal case rows remain.
16. Passing runs auto-publish as `published`; failing runs finalize as
    `qc_failed`.

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

`runBenchmark` can reclaim a stale `running` case row after
`serverSettings.benchmark.caseClaimStaleAfterMs` elapses. The default is
`11` minutes, chosen to sit just beyond the benchmark route's `600s`
`maxDuration`. Claim-token guarded writes prevent stale workers from writing
terminal results after another worker has reclaimed the case.

### Safe Parallelism

Benchmark runs no longer use a single run-level owner. Multiple Vercel cron
invocations or manual requests can overlap safely because each worker claims a
single case row at a time.

### Legacy Run Migration

If a legacy run still carries `qcSummaryJson.executionToken` and its old
heartbeat is fresh, new workers leave it alone. Once that legacy worker becomes
stale, or flips the run back to `pending`, the case-worker initializer migrates
it in place and resumes from the preserved snapshot.

### Strict Parsing

The benchmark parser only accepts the structured appendix contract. There is no
heuristic fallback path in production.

### Auto-Publication

Completing a passing run publishes it automatically after QC review succeeds.

## Stored Data

### `benchmark_run`

- Run status and trigger
- Scheduled date
- Expected/completed/failed case counts
- QC summary and error log

### `benchmark_case_result`

- Lifecycle row for one `(run, case)` pair
- Queue status including `pending`, `running`, `completed`, `failed`, and
  `invalid_output`
- Claim token, started/completed timestamps, and attempt count
- Raw response and parsed appendix payload
- Requested and returned model IDs
- Token counts and latency
- Parser version and error message

Important: for migrated and new runs, `benchmark_case_result.created_at` is row
creation time, not completion time. Use `completed_at` as the completion
timestamp.

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
