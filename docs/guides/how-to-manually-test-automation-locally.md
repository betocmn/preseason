# How to Manually Test Automation Locally

## Overview

This guide covers the benchmark automation flow that replaced the legacy
exploration pipeline.

The local verification path is:

1. Start the app and seeded database.
2. Trigger `/api/cron/benchmark-run`.
3. Inspect benchmark run, case result, and case decision data.
4. Review QC and, if needed, publish from the admin UI.

## Prerequisites

- Local Supabase is running
- `.env.local` includes `DATABASE_URL`, `OPENROUTER_API_KEY`, and `CRON_SECRET`
- The seeded data contains at least one active benchmark season

## Start Local Services

```bash
supabase start
pnpm run db:migrate
pnpm run db:seed
pnpm run dev
```

App URL: `http://localhost:3000`

## 1) Trigger the Benchmark Runner

```bash
export CRON_SECRET="your-local-cron-secret"

curl -s \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/benchmark-run
```

Expected response shape:

- `ok: true`
- `summary.runId`
- `summary.status`
- `summary.totalCases`
- `summary.completedCases`
- `summary.failedCases`
- `summary.invalidOutputCases`
- `summary.unresolvedToolCount`
- `summary.qc`

Note:

- `completed` means the run finished execution and passed QC.
- `qc_failed` means the run finished execution but did not clear QC.
- The cron route does not publish runs automatically.

## 2) Inspect Benchmark Runs

Open Supabase Studio and run:

```sql
select
  id,
  season_id,
  scheduled_for,
  status,
  trigger,
  expected_case_count,
  completed_case_count,
  failed_case_count,
  qc_status,
  created_at,
  started_at,
  completed_at
from preseason_benchmark_run
order by created_at desc
limit 5;
```

What to confirm:

- Re-running the cron for the same day reuses the same run record.
- `status` is `completed` or `qc_failed` after execution settles.
- Counts roughly match the active season case matrix.

## 3) Inspect Case Results

```sql
select
  run_id,
  case_id,
  status,
  requested_model_id,
  returned_model_id,
  provider,
  latency_ms,
  total_tokens,
  parser_version,
  left(coalesce(error_message, ''), 120) as error_preview
from preseason_benchmark_case_result
order by created_at desc
limit 20;
```

What to confirm:

- Completed cases have `status = 'completed'`.
- Invalid structured output shows up as `status = 'invalid_output'`.
- Provider-returned model IDs match expectations unless drift is being tested.

## 4) Inspect Case Decisions and Tool Candidates

```sql
select
  d.case_result_id,
  c.slug as category_slug,
  d.decision_type,
  t.slug as tool_slug,
  d.raw_tool_name,
  d.resolution_status
from preseason_benchmark_case_decision d
join preseason_category c on c.id = d.category_id
left join preseason_tool t on t.id = d.tool_id
order by d.case_result_id desc
limit 30;
```

```sql
select
  raw_name,
  normalized_name,
  status,
  seen_count,
  first_seen_at,
  last_seen_at
from preseason_tool_candidate
order by last_seen_at desc
limit 20;
```

What to confirm:

- Each completed case produces exactly one decision per eligible category.
- Unknown tool names land in `preseason_tool_candidate`.
- `resolution_status = 'unresolved_tool'` rows stay out of rankings until
  reviewed.

## 5) Review QC and Publish

If a run clears QC, open the admin UI at:

- `/admin/benchmark/runs/<runId>`

Use the publish action there. If the run is `qc_failed`, inspect the QC summary
and case-result failures before retrying failed cases or changing the season
panel.

## 6) Regression Commands

```bash
pnpm run check
pnpm run test
pnpm run build
```

Focused benchmark suite:

```bash
pnpm exec vitest run \
  src/server/llm/benchmark/parser.test.ts \
  src/server/llm/benchmark/runner.test.ts \
  src/server/llm/benchmark/scoring.test.ts \
  src/server/api/routers/benchmark-admin.test.ts \
  src/server/api/routers/benchmark-public.test.ts
```
