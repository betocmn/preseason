# How to Manually Test Automation Locally

## Overview

This guide walks through manually testing the production automation pipeline on your local machine:

1. Trigger a run (`/api/cron/run`)
2. Verify `run -> run_result -> recommendation` data flow
3. Trigger settlement/generation (`/api/cron/settle`)

Use this when validating automation changes end-to-end against your local database.

## Prerequisites

- Local Supabase is running
- `pnpm install` has been run
- `.env.local` includes:
  - `OPENROUTER_API_KEY`
  - `CRON_SECRET`
  - `DATABASE_URL`
- Prompts and LLMs exist and are active (seed data provides this)

## Start local services

```bash
supabase start
pnpm run db:migrate
pnpm run db:seed
pnpm run dev
```

App URL: `http://localhost:3000`

## Important note about manual runs

`tRPC run.triggerManual` currently creates a `pending` run record, but does not execute the automation runner itself. For full pipeline testing, call the cron endpoint directly.

## 1) Trigger automation run locally

In a new terminal:

```bash
export CRON_SECRET="your-local-cron-secret"

curl -s \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/run
```

Expected response shape:

- `ok: true`
- `summary.runId`
- `summary.totalPairs`
- `summary.succeededPairs`
- `summary.failedPairs`
- `summary.recommendationCount`

If all pairs fail, check:

- `OPENROUTER_API_KEY` validity
- network access to OpenRouter
- `summary.errors` and `preseason_run.error_log`

## 2) Verify run data in the database

Open Supabase Studio (`http://localhost:58823`) and run these SQL checks.

### Latest runs

```sql
select
  id,
  status,
  trigger,
  prompt_count,
  llm_count,
  created_at,
  started_at,
  completed_at
from preseason_run
order by created_at desc
limit 5;
```

### Latest run results

```sql
select
  rr.run_id,
  rr.prompt_id,
  rr.llm_id,
  rr.parse_status,
  rr.response_time_ms,
  left(coalesce(rr.raw_response, ''), 160) as raw_response_preview,
  rr.created_at
from preseason_run_result rr
order by rr.created_at desc
limit 20;
```

### Recommendations created from run results

```sql
select
  r.run_result_id,
  t.name as tool,
  c.slug as category,
  r.confidence,
  r.rank,
  left(coalesce(r.reasoning, ''), 120) as reasoning_preview,
  r.created_at
from preseason_recommendation r
join preseason_tool t on t.id = r.tool_id
join preseason_category c on c.id = r.category_id
order by r.created_at desc
limit 30;
```

What to confirm:

- The latest run is `completed` when at least one pair succeeded.
- `run_result` rows exist for prompt x llm combinations.
- `parse_status` is `success` for parsed rows.
- `recommendation` rows exist and link to valid tools/categories.

## 3) Trigger settlement + match generation

```bash
curl -s \
  -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/settle
```

Expected response shape:

- `ok: true`
- `settled.settledCount`
- `generated.createdCount`

Notes:

- `settledCount` is non-zero only when active matches are past `periodEnd`.
- `createdCount` is non-zero only when tool pairs in the same category meet threshold and have no active match.

## 4) Verify matches

```sql
select
  id,
  category_id,
  tool_a_id,
  tool_b_id,
  status,
  period_start,
  period_end,
  tool_a_score,
  tool_b_score,
  winner_tool_id,
  settled_at
from preseason_match
order by started_at desc nulls last
limit 20;
```

What to confirm:

- Settled matches have scores and `settled_at` set.
- Tie settlements have `winner_tool_id = null`.
- New generated matches are `active` and have period windows.

## 5) Quick regression test commands

For local automation changes, run:

```bash
pnpm run check
pnpm run test
```

Focused automation suite:

```bash
pnpm exec vitest run \
  src/server/llm/service/providers.test.ts \
  src/server/llm/automation/parser.test.ts \
  src/server/llm/automation/runner.test.ts \
  src/server/llm/automation/match-settler.test.ts
```

## Troubleshooting

- `401 Unauthorized` from cron routes:
  - Missing or incorrect `Authorization: Bearer <CRON_SECRET>` header
  - `CRON_SECRET` mismatch between shell and app env
- `CRON_SECRET is not configured`:
  - Missing `CRON_SECRET` in `.env.local`
- Run status stuck at `failed`:
  - Check run summary errors and `preseason_run.error_log`
- Zero recommendations:
  - Responses may be unparsable for current prompt/model output
  - Inspect `raw_response` and parser behavior
