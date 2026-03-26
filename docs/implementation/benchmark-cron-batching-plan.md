# Benchmark Cron Batching Plan

## Why This Exists

The current benchmark cron route is not production-safe on Vercel as written.

As of March 26, 2026, the active benchmark season on this repo's real database
has:

- `15` prompt versions
- `20` model snapshots
- `300` benchmark cases per daily run

`GET /api/cron/benchmark-run` currently does all work in one request and the
runner processes cases serially, one `llmService.complete()` call at a time.

Real OpenRouter smoke data from March 26, 2026 showed:

- `8` cases took `63.01s`, `68.44s`, `71.07s`, and `84.45s`
- average case latency was `8692.93ms`
- the full `300`-case daily run is therefore roughly `40-53 minutes`

That does not fit Vercel Pro function limits for a single invocation. The
benchmark cron must be broken into small resumable batches.

## Current Behavior

- `vercel.json` schedules `/api/cron/benchmark-run` once per day
- the route resolves the newest `active` benchmark season
- `runBenchmark(seasonId, scheduledFor)` creates or loads a run keyed by
  `(season_id, scheduled_for)`
- once claimed, the runner loops through every pending case until the run is
  terminal
- if the invocation times out, the run stays partial and the next calendar day
  creates a different run

This is the operational gap: the pipeline is resumable by date, but the cron
schedule is too sparse to finish a full day safely.

## Goal

Make benchmark execution safe for Vercel Pro by spreading one daily benchmark
run across many short cron invocations.

## Non-Goals

- Do not change the benchmark methodology
- Do not add case-level parallelism in this task
- Do not change match cron behavior unless required by shared helpers
- Do not auto-publish runs

## Recommended Shape

### Schedule

Change benchmark cron from once per day to every 15 minutes:

```json
{ "path": "/api/cron/benchmark-run", "schedule": "*/15 * * * *" }
```

Keep `/api/cron/match-run` on its current 15-minute cadence.

### Per-Invocation Work Budget

Use a fixed small chunk size, not a full-run execution.

Recommended starting default:

- `8` benchmark cases per cron invocation

Why `8`:

- it was already exercised successfully in live OpenRouter smoke runs
- it completed in about `63-84s` in practice
- `8 * 96 = 768` cases/day of capacity on a 15-minute schedule
- the current active panel needs only `300` cases/day, so this gives about
  `2.56x` daily headroom
- a full `300`-case run should finish in about `38` invocations, or about
  `9.5` hours, assuming normal cron health

Expose the chunk size as config so it can be tuned later without code changes.

Suggested config:

- `BENCHMARK_CASES_PER_CRON=8`

If you do not want a new env var yet, start with a constant in the runner and
document it clearly.

### Route Semantics

Each cron invocation should do exactly one of these:

1. Continue the oldest unfinished benchmark run for the active season
2. If no unfinished run exists, create or load the run for the current UTC day
3. Process only one chunk
4. Return a summary that makes it obvious whether work remains

This is important: the route must prefer resuming unfinished work over starting
a fresh day. Otherwise a run that misses completion before midnight becomes
operationally stranded.

### Run Lifecycle

Keep the existing run record model, but allow partial progress.

Recommended behavior:

- When a run is claimed for a chunk, mark it `running`
- Process up to `BENCHMARK_CASES_PER_CRON` pending cases
- If cases remain after the chunk:
  - persist counts so far
  - set the run back to `pending`
  - do not set `completedAt`
  - do not evaluate final QC as terminal truth yet
- If no cases remain:
  - compute final QC
  - mark the run `completed` or `qc_failed`
  - set `completedAt`

This lets the next cron invocation pick the same run back up without waiting
for a stale-running timeout.

### Ownership and Stale Recovery

Preserve stale-worker recovery, but tune it for frequent cron.

Recommended adjustments:

- keep the current heartbeat mechanism
- reduce the stale threshold to something appropriate for chunked work, such as
  `10-15 minutes`
- do not overwrite the original `startedAt` on every chunk reclaim if the run
  has already started once

The current once-a-day logic can afford a 30-minute stale window. A 15-minute
cron should reclaim faster.

## Implementation Outline

### 1. Update the Cron Schedule

Files:

- `vercel.json`

Change:

- `/api/cron/benchmark-run` from daily to `*/15 * * * *`

### 2. Teach the Route to Resume Unfinished Work First

Files:

- `src/app/api/cron/benchmark-run/route.ts`
- possibly `src/server/api/helpers/benchmark.ts` or a new benchmark-run helper

Add a helper that:

- finds the newest `active` benchmark season
- finds the oldest unfinished run in that season with status in:
  - `pending`
  - `failed`
  - `running` if stale
- if such a run exists, continue it regardless of its `scheduledFor`
- otherwise create or load the run for the current UTC date

The route response should include enough state to tell whether the run is still
in progress, for example:

- `processedThisInvocation`
- `remainingCases`
- `hasRemainingWork`
- `scheduledFor`
- `runStatus`

### 3. Add Chunked Benchmark Execution

Files:

- `src/server/llm/benchmark/runner.ts`

Recommended API change:

- extend `runBenchmark()` with an options field such as:
  - `maxCases?: number`
  - optionally `timeBudgetMs?: number`

Within `executeRun()`:

- load all cases as today
- determine which cases are still pending
- slice to at most `maxCases`
- process only that slice
- after the slice:
  - if more cases remain, update run counts and set status back to `pending`
  - if no cases remain, finalize exactly as today

Preserve:

- idempotency by `(season, date)`
- retry of `failed` and `invalid_output`
- ownership checks before writes
- heartbeat writes

### 4. Keep Metrics Honest for Partial Runs

The runner summary must distinguish:

- a terminal completed run
- a partially processed run awaiting more cron invocations

Do not claim partial work is `completed`.

Possible summary states:

- keep DB status `pending` for resumable runs
- return summary status `running` if work remains

Whichever shape you choose, keep it explicit and test it.

### 5. Add Regression Coverage

Files:

- `src/server/llm/benchmark/runner.test.ts`
- `src/app/api/cron/benchmark-run/route.test.ts`

Must-cover cases:

- a run processes only `N` cases when `maxCases = N`
- a second invocation resumes the same run and does not duplicate results
- the final invocation transitions to `completed` or `qc_failed`
- unfinished previous-day work is resumed before a new-day run is started
- stale `running` runs can still be reclaimed
- route output reports remaining work correctly

### 6. Update Docs

Files:

- `docs/guides/how-cron-benchmarks-work.md`
- optionally `docs/implementation/background-cron-openrouter-audit.md`

Document:

- the new 15-minute schedule
- the chunk size
- the fact that one logical daily run is assembled across many cron invocations

## Suggested Acceptance Criteria

- `/api/cron/benchmark-run` runs every 15 minutes in `vercel.json`
- one invocation processes only a bounded chunk of benchmark cases
- the same run resumes across multiple invocations until terminal
- unfinished previous-day runs are resumed before creating a new day
- no duplicate `benchmark_case_result` rows are created
- the route finishes comfortably within Vercel Pro request duration limits
- docs reflect the new behavior

## Suggested Verification

### Automated

- `pnpm run check`
- focused benchmark tests around runner and route

### Real Smoke

Use the real OpenRouter harness after implementation, but increase the smoke
matrix enough to require more than one invocation, or add a test-only small
`maxCases` override.

Verify:

1. first invocation leaves the run non-terminal with remaining work
2. second invocation resumes the same run
3. final invocation reaches terminal state

## Notes for the Implementing LLM

- Prefer the smallest change that preserves the current benchmark data model
- Do not introduce a brand-new queue table unless the existing run/result model
  proves insufficient
- The highest-risk edge case is midnight rollover with unfinished work; solve
  that explicitly
- The second highest-risk edge case is leaving the run stuck in `running`
  between cron invocations; solve that explicitly too
