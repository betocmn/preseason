# How Automation Works

## Overview

Automation is the daily pipeline that:

1. Loads active prompts and LLMs
2. Runs prompt x LLM combinations
3. Parses responses into recommendations
4. Settles finished matches
5. Generates new matches from recommendation activity

This is separate from Promptfoo evals (development-only).

## File structure

```
src/server/llm/automation/
  parser.ts               <-- parse raw LLM output into recommendation rows
  runner.ts               <-- run orchestration pipeline
  match-settler.ts        <-- settle expired active matches
  match-generator.ts      <-- generate new active matches

src/app/api/cron/
  run/route.ts            <-- create run + execute runner
  settle/route.ts         <-- settle + generate matches

vercel.json               <-- cron schedules
```

## End-to-end flow

```
Vercel Cron /api/cron/run
  -> create pending run (active prompts + active llms)
  -> runAutomation(runId)
    -> run_result rows
    -> recommendation rows

Vercel Cron /api/cron/settle
  -> settleExpiredMatches()
  -> generateMatches()
```

## Runner (`runAutomation`)

`src/server/llm/automation/runner.ts`

### Inputs

- `runId`
- Optional injected dependencies:
  - `database`
  - `llmService`
  - `now()`

### Pipeline behavior

1. Load run by ID.
2. Set run status to `running` and set `startedAt`.
3. Load selected prompts (`run.promptIds`) and llms (`run.llmIds`).
4. Build system prompt from category slugs.
5. For each prompt:
   - Load markdown content via `getPromptContent(slug, level)`.
6. For each prompt x llm pair:
   - Call `llmService.complete(provider, ...)`.
   - Upsert `run_result` for `(runId, promptId, llmId)`.
   - Parse content via `parseRecommendations`.
   - Replace existing recommendations for that run result and insert parsed rows.
   - Mark `run_result.parseStatus = success`.
7. On pair failures:
   - Persist failed `run_result` with error text and `parseStatus = failed`.
   - Continue remaining pairs.
8. Complete run:
   - `completed` if any pair succeeded.
   - `failed` if all pairs failed or run had no prompt/llm selection.

### Stored data

- `preseason_run`
  - `status`, `startedAt`, `completedAt`, `errorLog`
- `preseason_run_result`
  - raw response/error text
  - parse status
  - response time
- `preseason_recommendation`
  - `toolId`, `categoryId`, `confidence`, `reasoning`, `rank`

## Parser (`parseRecommendations`)

`src/server/llm/automation/parser.ts`

### Strategy

1. Try structured JSON extraction first:
   - direct JSON
   - fenced markdown JSON
   - nested object capture
2. Fallback to prose/markdown heuristics:
   - bullets (`- auth: Clerk`)
   - numbered lists (`1. auth -> Clerk`)
   - table rows
   - simple prose patterns (`For auth, Clerk`)

### Normalization and mapping

- Category mapping by slug/name normalization to `preseason_category`.
- Tool mapping in this order:
  1. exact normalized match against tool names/slugs/aliases
  2. fuzzy match (bigram similarity)
  3. auto-create tool when unmatched

Unknown tool auto-create behavior:

- Inserts into `preseason_tool` with `isVerified = false`
- Adds review description
- Ensures unique slug
- Creates `preseason_tool_category` link for matched category

### Output shape

Parser returns ordered, deduped items:

- `toolId`
- `categoryId`
- `confidence`
- `reasoning`
- `rank`

## Match settlement

`src/server/llm/automation/match-settler.ts`

- Finds active matches whose `periodEnd` is in the past.
- Counts recommendations for `toolA` and `toolB` inside match date window.
- Updates match:
  - `status = settled`
  - `settledAt`
  - `toolAScore`, `toolBScore`
  - `totalPrompts`
  - `winnerToolId` (`null` on tie)

## Match generation

`src/server/llm/automation/match-generator.ts`

- Aggregates recommendation counts per `(categoryId, toolId)`.
- Keeps tools meeting `minimumRecommendations` (default `3`).
- Creates pairwise active matches within category when no active match exists.
- Uses rolling period defaults:
  - `periodStart = today`
  - `periodEnd = today + 6 days` (7-day window)

## Cron endpoints

### `/api/cron/run`

`src/app/api/cron/run/route.ts`:

- Requires `Authorization: Bearer <CRON_SECRET>`
- Loads active prompt/llm IDs
- Creates pending run with `trigger = cron`
- Calls `runAutomation`
- Returns summary JSON

### `/api/cron/settle`

`src/app/api/cron/settle/route.ts`:

- Requires same bearer token
- Executes:
  - `settleExpiredMatches`
  - `generateMatches`
- Returns settlement + generation summary

## Scheduling

`vercel.json` defines:

- `/api/cron/run` at `0 6 * * *`
- `/api/cron/settle` at `0 8 * * *`

## Environment

- `OPENROUTER_API_KEY` for LLM calls
- `CRON_SECRET` for cron endpoint auth

## Tests

Automation coverage lives in colocated tests:

- `src/server/llm/automation/parser.test.ts`
- `src/server/llm/automation/runner.test.ts`
- `src/server/llm/automation/match-settler.test.ts`
