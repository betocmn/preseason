# Match Evaluations — Direct Head-to-Head LLM Comparisons

## Context

Currently, matches (head-to-head tool comparisons) are computed **passively** from general benchmark decisions. The system asks LLMs "what tool would you use for X?" and then derives match data by counting how often each tool is picked. This means:

- LLMs are never asked to **directly compare** two specific tools
- There's no structured data about **why** one tool beats another
- We lack **qualitative reasoning** — only quantitative win/loss counts

This feature adds **direct match evaluations**: dedicated prompts that ask LLMs to choose between two specific tools in a category and explain their reasoning, storing structured strengths/weaknesses data.

### Relationship to Existing Passive H2H Data

The new match evaluations are a **separate, complementary layer** that lives alongside the existing passive H2H system:

- **Passive H2H** (existing, unchanged): Win rates derived from general benchmark decisions in `benchmarkCaseDecisions`. Computed on-the-fly by `computeHeadToHead()` in `src/server/llm/benchmark/scoring.ts`.
- **Direct match evaluations** (new): Structured reasoning from deliberate A-vs-B comparison prompts. Stored in dedicated tables. Returned alongside passive stats in the `headToHead` tRPC response.

Both systems share the same `benchmarkSeasons` and `benchmarkModelSnapshots` infrastructure but are otherwise independent.

---

## Schema Changes

All changes go in `src/server/db/schema.ts` following existing patterns (`createTable` from `pgTableCreator`, UUID primary keys, `$defaultFn(() => new Date())` for timestamps).

### New Enums

```typescript
export const matchBatchStatusEnum = pgEnum('match_batch_status', [
  'pending',
  'running',
  'completed',
  'failed',
])

export const matchEvaluationStatusEnum = pgEnum('match_evaluation_status', [
  'pending',
  'completed',
  'failed',
  'invalid_output',
])

export const matchWinnerDecisionEnum = pgEnum('match_winner_decision', [
  'tool_a',
  'tool_b',
  'tie',
  'abstain',
])

export const matchPresentationOrderEnum = pgEnum('match_presentation_order', [
  'a_first',
  'b_first',
])
```

### New Tables

**`preseason_match_config`** — admin-managed list of matchups to auto-evaluate each benchmark run:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `season_id` | uuid FK → benchmarkSeasons | |
| `category_id` | uuid FK → subcategories | |
| `tool_a_id` | uuid FK → tools | |
| `tool_b_id` | uuid FK → tools | |
| `is_active` | boolean, default true | |
| `created_by` | uuid FK → userProfiles | |
| `created_at` | timestamp w/ tz | |

Constraints:
- Unique on `(season_id, category_id, tool_a_id, tool_b_id)`
- Check: `tool_a_id < tool_b_id` (canonical ordering prevents duplicate reversed pairs)

**`preseason_match_prompt_template`** — versioned comparison prompt templates:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `slug` | varchar(100), unique | e.g., `"match-compare-v1"` |
| `name` | varchar(255) | |
| `template_md` | text | Contains `{{TOOL_A}}`, `{{TOOL_B}}`, `{{CATEGORY}}` placeholders |
| `schema_version` | varchar(50) | e.g., `"match-v1"` |
| `is_active` | boolean, default false | Only one active at a time |
| `created_at` | timestamp w/ tz | |

Constraints:
- Unique partial index on `is_active` where `is_active = true` (same pattern as `benchmarkModelWeightConfigs`)

**`preseason_match_batch`** — groups evaluations into triggered batches:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `season_id` | uuid FK → benchmarkSeasons | |
| `category_id` | uuid FK → subcategories | |
| `tool_a_id` | uuid FK → tools | |
| `tool_b_id` | uuid FK → tools | |
| `prompt_template_id` | uuid FK → matchPromptTemplates | |
| `benchmark_run_id` | uuid FK → benchmarkRuns, nullable | Links to the benchmark run that triggered this batch (null for manual triggers) |
| `status` | matchBatchStatusEnum | |
| `total_evaluations` | integer, default 0 | |
| `completed_evaluations` | integer, default 0 | |
| `failed_evaluations` | integer, default 0 | |
| `triggered_by` | uuid FK → userProfiles, nullable | null for auto-triggered |
| `started_at` | timestamp w/ tz, nullable | |
| `completed_at` | timestamp w/ tz, nullable | |
| `created_at` | timestamp w/ tz | |

**`preseason_match_evaluation`** — one result per (batch, model, presentation order):

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `batch_id` | uuid FK → matchBatches, onDelete cascade | |
| `model_snapshot_id` | uuid FK → benchmarkModelSnapshots | |
| `presentation_order` | matchPresentationOrderEnum | `'a_first'` or `'b_first'` |
| `status` | matchEvaluationStatusEnum | |
| `winner_decision` | matchWinnerDecisionEnum, nullable | |
| `winner_id` | uuid FK → tools, nullable | null for tie/abstain |
| `reasoning` | text, nullable | LLM's full explanation |
| `tool_a_strengths` | text, nullable | Comma-separated or JSON array of strengths |
| `tool_b_strengths` | text, nullable | |
| `confidence` | real, nullable | 0-1 self-reported |
| `raw_response` | text, nullable | Full LLM response |
| `requested_model_id` | varchar(255) | |
| `returned_model_id` | varchar(255), nullable | |
| `provider` | varchar(100), nullable | |
| `prompt_tokens` | integer, nullable | |
| `completion_tokens` | integer, nullable | |
| `total_tokens` | integer, nullable | |
| `latency_ms` | integer, nullable | |
| `error_message` | text, nullable | |
| `created_at` | timestamp w/ tz | |

Constraints:
- Unique on `(batch_id, model_snapshot_id, presentation_order)`

### Relations

Add relations following existing patterns (see `benchmarkCaseResultsRelations`, `benchmarkCaseDecisionsRelations` in schema.ts):
- `matchConfigs` → season, category, toolA, toolB, createdBy
- `matchBatches` → season, category, toolA, toolB, promptTemplate, benchmarkRun, triggeredBy, evaluations
- `matchEvaluations` → batch, modelSnapshot, winner

---

## New Files

### `src/server/llm/match/schema.ts`

Zod schema for validating LLM responses. Follow the pattern in `src/server/llm/benchmark/schema.ts`.

```typescript
import { z } from 'zod'

export const matchResponseSchema = z.object({
  schema_version: z.literal('match-v1'),
  winner: z.enum(['tool_a', 'tool_b', 'tie']),
  reasoning: z.string().min(1),
  tool_a_strengths: z.array(z.string().min(1)).min(1),
  tool_b_strengths: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
})

export type MatchResponse = z.infer<typeof matchResponseSchema>

export function validateMatchResponse(
  data: unknown,
): { success: true; data: MatchResponse } | { success: false; error: string } {
  const parsed = matchResponseSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join('; ') }
  }
  return { success: true, data: parsed.data }
}
```

### `src/server/llm/match/prompt-builder.ts`

Interpolates the template and appends structured output instructions. Follow the pattern in `src/server/llm/benchmark/prompt-builder.ts`.

```typescript
export type MatchPromptContext = {
  templateMd: string
  toolAName: string
  toolBName: string
  categoryName: string
}

export function buildMatchPrompt(ctx: MatchPromptContext): string {
  const content = ctx.templateMd
    .replace(/\{\{TOOL_A\}\}/g, ctx.toolAName)
    .replace(/\{\{TOOL_B\}\}/g, ctx.toolBName)
    .replace(/\{\{CATEGORY\}\}/g, ctx.categoryName)

  return [
    content,
    '',
    '---',
    '',
    'IMPORTANT: After your natural-language answer, you MUST include a machine-readable appendix.',
    'Wrap it exactly between the XML tags shown below. The JSON must be valid and complete.',
    '',
    '<preseason_match_json>',
    '{',
    '  "schema_version": "match-v1",',
    '  "winner": "tool_a | tool_b | tie",',
    '  "reasoning": "<2-4 sentences explaining your choice>",',
    `  "tool_a_strengths": ["<strength of ${ctx.toolAName}>", ...],`,
    `  "tool_b_strengths": ["<strength of ${ctx.toolBName}>", ...],`,
    '  "confidence": 0.85',
    '}',
    '</preseason_match_json>',
  ].join('\n')
}
```

### `src/server/llm/match/parser.ts`

Parses the LLM response to extract structured JSON. Follow the pattern in `src/server/llm/benchmark/parser.ts` but use `<preseason_match_json>` tags.

Key exports:
- `MATCH_PARSER_VERSION = 'match-strict-v1'`
- `type MatchParseResult = { status: 'ok'; response: MatchResponse; rawAppendix: string; naturalResponse: string } | { status: 'invalid_output'; reason: string }`
- `parseMatchResponse(rawContent: string): MatchParseResult`

Reuse the same tag-finding and JSON-depth-tracking logic from the benchmark parser. Consider extracting shared helpers into a common utility if the duplication is significant.

### `src/server/llm/match/runner.ts`

Executes match evaluations for a batch. Follow the pattern in `src/server/llm/benchmark/runner.ts`.

```typescript
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '~/server/db/schema'
import { LlmService } from '~/server/llm/service'
import { buildMatchPrompt } from './prompt-builder'
import { parseMatchResponse } from './parser'
import { buildGenerationSystemPrompt } from '~/server/llm/service/system-prompt'

type DatabaseClient = PostgresJsDatabase<typeof schema>

export type MatchRunOptions = {
  database?: DatabaseClient
  llmService?: LlmService
}

export async function runMatchBatch(
  batchId: string,
  options?: MatchRunOptions,
): Promise<MatchBatchSummary> {
  // 1. Load batch with related data (season, category, tools, template)
  // 2. Load all active model snapshots for the season
  // 3. For each model snapshot, run TWICE (a_first and b_first):
  //    a. Build prompt with appropriate tool ordering
  //    b. Call LlmService.complete() using the model's provider + requestedModelId
  //    c. Parse response with parseMatchResponse()
  //    d. Store evaluation result
  // 4. Update batch status and counts
  // 5. Return summary
}
```

Key details:
- Use `LlmService` (from `src/server/llm/service/index.ts`) with `CompletionRequest` type
- Use `buildGenerationSystemPrompt()` from `src/server/llm/service/system-prompt.ts`
- For each model snapshot, create **two evaluations**: one with `presentation_order = 'a_first'` and one with `'b_first'` (swap tool names in the prompt)
- Store token usage, latency, model IDs on each evaluation (same fields as `benchmarkCaseResults`)
- Map `winner: 'tool_a'` to the actual `winnerId` based on presentation order (if tools were swapped, 'tool_a' in the response means tool B in reality)

### `src/server/api/routers/match.ts`

tRPC router for admin match configuration and triggering. Follow patterns in `src/server/api/routers/benchmark-admin.ts`.

Procedures:

```typescript
// Admin procedures (require admin role)

configureMatch:
  // Add or update a match config
  // Input: seasonId, categorySlug, toolASlug, toolBSlug, isActive
  // Enforce canonical ordering: toolAId < toolBId
  // Upsert into matchConfigs table

listConfigs:
  // List all match configs for a season
  // Input: seasonId, optional categorySlug filter
  // Return with tool/category details

removeConfig:
  // Soft-delete (set isActive = false) a match config

triggerBatch:
  // Manually trigger a match evaluation batch
  // Input: seasonId, categorySlug, toolASlug, toolBSlug
  // Creates a batch and calls runMatchBatch()
  // Returns batch summary

listBatches:
  // List batches with pagination
  // Input: seasonId, optional categoryId/status filters, limit, offset

getBatch:
  // Get batch details with individual evaluations
  // Input: batchId
```

### `src/server/llm/match/auto-trigger.ts`

Logic for triggering match evaluations after a benchmark run completes.

```typescript
export async function triggerMatchEvaluationsForRun(
  database: DatabaseClient,
  seasonId: string,
  benchmarkRunId: string,
): Promise<{ batchesCreated: number; errors: string[] }> {
  // 1. Load all active match configs for the season
  // 2. Load the active match prompt template
  // 3. For each config, create a batch linked to the benchmarkRunId
  // 4. Run each batch (sequentially to avoid rate limits, or with controlled concurrency)
  // 5. Return summary
}
```

---

## Modified Files

### `src/server/db/schema.ts`
- Add the 4 new enums listed above
- Add 4 new tables: `matchConfigs`, `matchPromptTemplates`, `matchBatches`, `matchEvaluations`
- Add relations for all 4 tables
- Follow existing naming and index patterns

### `src/server/api/root.ts`
- Import and register the `match` router:
```typescript
import { matchRouter } from '~/server/api/routers/match'
// ...
match: matchRouter,
```

### `src/server/api/routers/benchmark-match.ts`
- Extend the `headToHead` procedure to also query and return direct match evaluation summaries when available
- Add a new field to the return type:
```typescript
return {
  category, toolA, toolB, result,
  matchEvaluations: {
    totalEvaluations: number,
    consistentWinner: string | null,  // tool slug if same winner across models
    orderBiasDetected: boolean,       // true if swapped order changes results
    summaries: Array<{
      modelName: string,
      winnerDecision: string,
      reasoning: string,
      toolAStrengths: string[],
      toolBStrengths: string[],
      confidence: number,
      isOrderConsistent: boolean,     // same winner regardless of presentation order
    }>,
  } | null,
}
```

### `src/app/api/cron/benchmark-run/route.ts`
- After `runBenchmark()` succeeds, call `triggerMatchEvaluationsForRun()`:
```typescript
import { triggerMatchEvaluationsForRun } from '~/server/llm/match/auto-trigger'

// After line 49:
const summary = await runBenchmark(activeSeason.id, scheduledFor)

// Add:
let matchResult = null
try {
  matchResult = await triggerMatchEvaluationsForRun(db, activeSeason.id, summary.runId)
} catch (error) {
  // Log but don't fail the cron — benchmark run already succeeded
  console.error('Match evaluations failed:', error)
}

return NextResponse.json({ ok: true, summary, matchEvaluations: matchResult })
```

---

## Bias Mitigation Details

Each matchup runs **twice per model** with tool presentation order swapped:
1. **a_first**: Prompt says "Compare Tool A vs Tool B" → store with `presentation_order = 'a_first'`
2. **b_first**: Prompt says "Compare Tool B vs Tool A" → store with `presentation_order = 'b_first'`

When mapping back to canonical tool IDs:
- In `a_first`: `winner = 'tool_a'` means `winnerId = toolAId`
- In `b_first`: `winner = 'tool_a'` means `winnerId = toolBId` (because tools were swapped in presentation)

The `isOrderConsistent` flag in the response marks whether the same model gave the same winner regardless of order.

---

## Implementation Order

1. Add enums and tables to `src/server/db/schema.ts` with relations
2. Run `pnpm run db:generate` then `pnpm run db:migrate`
3. Create `src/server/llm/match/schema.ts` with Zod validation + tests
4. Create `src/server/llm/match/prompt-builder.ts` + tests
5. Create `src/server/llm/match/parser.ts` + tests
6. Create `src/server/llm/match/runner.ts` + tests
7. Create `src/server/llm/match/auto-trigger.ts` + tests
8. Create `src/server/api/routers/match.ts` + tests
9. Register router in `src/server/api/root.ts`
10. Extend `src/server/api/routers/benchmark-match.ts` to return match evaluation summaries
11. Update `src/app/api/cron/benchmark-run/route.ts` to trigger match evaluations post-run

---

## Verification

1. `pnpm run db:generate` — generates clean migration
2. `pnpm run db:migrate` — applies without errors
3. `pnpm run check` — no lint or type errors
4. `pnpm run test` — all existing + new colocated tests pass
5. Manual test: insert a match config via tRPC, trigger a batch, verify evaluations are stored with both presentation orders
6. Manual test: call `benchmarkMatch.headToHead` and verify match evaluation summaries appear in response
7. Cron integration: verify that after a benchmark run, match evaluations are auto-triggered for active configs

---

## Key Reference Files

| File | Pattern to follow |
|------|-------------------|
| `src/server/db/schema.ts` | Table definitions, `createTable`, enums, relations, index patterns |
| `src/server/llm/benchmark/schema.ts` | Zod response schema + validation function |
| `src/server/llm/benchmark/prompt-builder.ts` | Prompt template construction with XML tags |
| `src/server/llm/benchmark/parser.ts` | XML tag extraction + JSON parsing from LLM responses |
| `src/server/llm/benchmark/runner.ts` | LLM execution loop, error handling, result storage |
| `src/server/llm/service/index.ts` | `LlmService` class, `complete()` method |
| `src/server/llm/service/types.ts` | `CompletionRequest`, `CompletionResponse` types |
| `src/server/llm/service/system-prompt.ts` | `buildGenerationSystemPrompt()` |
| `src/server/api/routers/benchmark-admin.ts` | Admin-only tRPC procedures, role checks |
| `src/server/api/routers/benchmark-match.ts` | Current match router to extend |
| `src/app/api/cron/benchmark-run/route.ts` | Cron route to add post-run trigger |
