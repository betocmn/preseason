# Match Evaluations — Direct Head-to-Head LLM Comparisons

## Context

Currently, matches (head-to-head tool comparisons) are computed passively from general benchmark decisions. The system asks LLMs "what tool would you use for X?" and then derives match data by counting how often each tool is picked. This means:

- LLMs are never asked to directly compare two specific tools
- There is no structured data about why one tool beats another
- There is no tool-scoped qualitative data that can later power brand or keyword analysis

This feature adds direct match evaluations: dedicated prompts that ask LLMs to compare two specific tools in a category, choose a winner, and return tool-scoped pros and cons with evidence sentences.

## Recommendation Summary

This should be implemented as a manual-first admin workflow, not as extra work inside the benchmark cron path.

- Keep the existing passive H2H pipeline unchanged
- Add a separate direct-evaluation pipeline with its own tables and admin router
- Make batch creation idempotent so the same benchmark run cannot fan out duplicate work
- Shape the LLM response so it is already useful for later analysis, instead of requiring a second extraction pass for match data
- Keep the public `benchmarkMatch.headToHead` route unchanged in v1

## Relationship to Existing Passive H2H Data

The new match evaluations are a separate, complementary layer:

- Passive H2H: existing win rates derived from `benchmarkCaseDecisions` and computed by `computeHeadToHead()`
- Direct match evaluations: structured A-vs-B comparison prompts with stored reasoning and tool-scoped evidence

Both systems share the same benchmark seasons and model snapshot infrastructure, but they should not share execution flow in the first version.

## Not In Initial Scope

The first version should not:

- Trigger match evaluations inline from `src/app/api/cron/benchmark-run/route.ts`
- Extend the existing public `benchmarkMatch.headToHead` tRPC response
- Depend on benchmark cron success to finish direct match work

Those can be added later once the prompt contract and storage shape are stable. This does not mean "no public match page". It means the first slice should stabilize the direct-evaluation data model before expanding the public read model.

---

## Schema Changes

All changes go in `src/server/db/schema.ts` following existing patterns (`createTable`, UUID primary keys, `$defaultFn(() => new Date())`, `jsonb` for structured payloads).

### New Enums

```typescript
export const matchBatchStatusEnum = pgEnum('match_batch_status', [
  'pending',
  'running',
  'completed',
  'failed',
])

export const matchTriggerModeEnum = pgEnum('match_trigger_mode', [
  'manual',
  'benchmark_run',
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

**`preseason_match_prompt_template`** — versioned comparison prompt templates

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `slug` | varchar(100), unique | e.g. `"match-compare-v2"` |
| `name` | varchar(255) | |
| `template_md` | text | Contains `{{TOOL_A}}`, `{{TOOL_B}}`, `{{CATEGORY}}` |
| `schema_version` | varchar(50) | e.g. `"match-v2"` |
| `system_prompt_snapshot` | text, nullable | Snapshot used for reproducibility |
| `is_active` | boolean, default false | Only one active at a time |
| `created_at` | timestamp w/ tz | |

Constraints:

- Unique partial index on `is_active` where `is_active = true`

**`preseason_match_config`** — optional admin-managed list of recurring matchups

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `season_id` | uuid FK → benchmarkSeasons | |
| `category_id` | uuid FK → subcategories | |
| `tool_a_id` | uuid FK → tools | Canonical lower UUID |
| `tool_b_id` | uuid FK → tools | Canonical higher UUID |
| `prompt_template_id` | uuid FK → matchPromptTemplates | Pinned at config creation time — ensures all batches from this config use the same prompt contract, mirroring how `benchmarkSeasonPrompts` freezes prompt versions per season |
| `is_active` | boolean, default true | |
| `created_by` | uuid FK → userProfiles | |
| `created_at` | timestamp w/ tz | |

Constraints:

- Unique on `(season_id, category_id, tool_a_id, tool_b_id)` where `is_active = true` — partial unique index so that only one active config exists per matchup, but disabled configs do not block creating a replacement with a new `prompt_template_id`
- Unique on `(id, season_id, category_id, tool_a_id, tool_b_id, prompt_template_id)` — required as the FK target for config-backed batches (the `id` PK already guarantees uniqueness, so this is a lightweight addition)
- Check: `tool_a_id < tool_b_id`
- Application validation: both tools must belong to the selected category via `toolCategories`

**`preseason_match_batch`** — a single evaluation job for one matchup

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `season_id` | uuid FK → benchmarkSeasons | |
| `config_id` | uuid FK → matchConfigs, nullable | null for one-off manual batches |
| `category_id` | uuid FK → subcategories | |
| `tool_a_id` | uuid FK → tools | Canonical order |
| `tool_b_id` | uuid FK → tools | Canonical order |
| `prompt_template_id` | uuid FK → matchPromptTemplates | |
| `benchmark_run_id` | uuid FK → benchmarkRuns, nullable | Set only for benchmark-linked batches |
| `trigger_mode` | matchTriggerModeEnum | `'manual'` or `'benchmark_run'` |
| `idempotency_key` | varchar(255), nullable | Unique when present |
| `status` | matchBatchStatusEnum | |
| `total_evaluations` | integer, default 0 | |
| `completed_evaluations` | integer, default 0 | |
| `failed_evaluations` | integer, default 0 | |
| `started_at` | timestamp w/ tz, nullable | |
| `claim_token` | uuid, nullable | Random token set when a worker claims execution; ownership-sensitive updates must include this token in the `where` clause |
| `last_heartbeat_at` | timestamp w/ tz, nullable | Updated periodically while `status = 'running'`; used for stale-run reclaim |
| `completed_at` | timestamp w/ tz, nullable | |
| `triggered_by` | uuid FK → userProfiles, nullable | null for automated future triggers |
| `created_at` | timestamp w/ tz | |

Constraints:

- Check: `tool_a_id < tool_b_id`
- Unique index on `idempotency_key` where `idempotency_key is not null`
- Unique on `(id, season_id)` — required as the FK target for evaluations (lightweight, since `id` is already the PK)
- Check: when `status = 'running'`, both `claim_token` and `last_heartbeat_at` must be non-null
- Index on `(status, last_heartbeat_at)` to make stale-run reclaim queries efficient
- When `config_id` is not null, the batch's `season_id`, `category_id`, `tool_a_id`, `tool_b_id`, and `prompt_template_id` must match the referenced config. Enforce this with a composite FK: `(config_id, season_id, category_id, tool_a_id, tool_b_id, prompt_template_id)` referencing the unique on `matchConfigs(id, season_id, category_id, tool_a_id, tool_b_id, prompt_template_id)`. This prevents config-backed batches from drifting on any dimension — including prompt version — from the config's definition. For one-off manual batches (`config_id IS NULL`), no composite FK applies

**`preseason_match_evaluation`** — one result per `(batch, model, presentation_order)`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `batch_id` | uuid FK → matchBatches, onDelete cascade | |
| `season_id` | uuid FK → benchmarkSeasons | Denormalized from batch for composite FK |
| `model_snapshot_id` | uuid FK → benchmarkModelSnapshots | Must come from the season's frozen model set |
| `presentation_order` | matchPresentationOrderEnum | `'a_first'` or `'b_first'` |
| `status` | matchEvaluationStatusEnum | |
| `winner_decision` | matchWinnerDecisionEnum, nullable | |
| `winner_id` | uuid FK → tools, nullable | null for tie or abstain |
| `comparison_summary` | text, nullable | Short natural-language comparison summary |
| `tool_a_pros` | jsonb, nullable | Array of `{ phrase, evidence_sentence }` |
| `tool_a_cons` | jsonb, nullable | Array of `{ phrase, evidence_sentence }` |
| `tool_b_pros` | jsonb, nullable | Array of `{ phrase, evidence_sentence }` |
| `tool_b_cons` | jsonb, nullable | Array of `{ phrase, evidence_sentence }` |
| `confidence` | real, nullable | 0-1 self-reported |
| `natural_response` | text, nullable | Natural-language answer before the appendix |
| `appendix_raw` | text, nullable | Raw JSON appendix |
| `appendix_json` | jsonb, nullable | Parsed JSON appendix |
| `raw_response` | text, nullable | Full model output |
| `requested_model_id` | varchar(255), nullable | |
| `returned_model_id` | varchar(255), nullable | |
| `provider` | varchar(100), nullable | |
| `finish_reason` | varchar(50), nullable | |
| `prompt_tokens` | integer, nullable | |
| `completion_tokens` | integer, nullable | |
| `total_tokens` | integer, nullable | |
| `latency_ms` | integer, nullable | |
| `temperature` | real, nullable | |
| `top_p` | real, nullable | |
| `max_tokens` | integer, nullable | |
| `seed` | integer, nullable | |
| `parser_version` | varchar(50), nullable | |
| `rendered_user_prompt` | text, nullable | Full rendered prompt sent to the model, including interpolated tool/category names — ensures reproducibility and auditability even after tool or category renames |
| `prompt_hash` | varchar(64), nullable | Hash of `rendered_user_prompt` |
| `system_prompt_snapshot` | text, nullable | |
| `error_message` | text, nullable | |
| `created_at` | timestamp w/ tz | |

Constraints:

- Unique on `(batch_id, model_snapshot_id, presentation_order)`
- Composite FK on `(batch_id, season_id)` referencing `matchBatches(id, season_id)` — ensures the evaluation's `season_id` always matches its owning batch, preventing cross-season corruption
- Composite FK on `(season_id, model_snapshot_id)` referencing `benchmarkSeasonModels(season_id, model_snapshot_id)` — enforces that every evaluation uses a model frozen into the season's panel, matching the `benchmarkCases` pattern

### Relations

- `matchPromptTemplates` → batches
- `matchConfigs` → season, category, toolA, toolB, createdBy, batches
- `matchBatches` → season, config, category, toolA, toolB, promptTemplate, benchmarkRun, triggeredBy, evaluations
- `matchEvaluations` → batch, modelSnapshot, winner

---

## New Files

### `src/server/llm/match/schema.ts`

Zod schema for the direct comparison appendix.

```typescript
import { z } from 'zod'

const evidenceItemSchema = z.object({
  phrase: z.string().min(1).max(100),
  evidence_sentence: z.string().min(1).max(280),
})

const toolAnalysisSchema = z.object({
  pros: z.array(evidenceItemSchema).max(8),
  cons: z.array(evidenceItemSchema).max(8),
})

export const matchResponseSchema = z.object({
  schema_version: z.literal('match-v2'),
  winner: z.enum(['tool_a', 'tool_b', 'tie', 'abstain']),
  comparison_summary: z.string().min(1),
  tool_a: toolAnalysisSchema,
  tool_b: toolAnalysisSchema,
  confidence: z.number().min(0).max(1),
})

export type MatchResponse = z.infer<typeof matchResponseSchema>
```

Important notes:

- `comparison_summary` is for human reading, not keyword extraction
- Tool-scoped pros and cons are the primary source for later brand analysis
- `abstain` is allowed for "insufficient evidence" cases

### `src/server/llm/match/prompt-builder.ts`

Interpolates the template and appends structured output instructions using the same tagged-JSON pattern as the benchmark pipeline.

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
    '  "schema_version": "match-v2",',
    '  "winner": "tool_a",',
    '  "comparison_summary": "<2-4 sentences>",',
    '  "tool_a": {',
    '    "pros": [{ "phrase": "<short phrase>", "evidence_sentence": "<sentence>" }],',
    '    "cons": [{ "phrase": "<short phrase>", "evidence_sentence": "<sentence>" }]',
    '  },',
    '  "tool_b": {',
    '    "pros": [{ "phrase": "<short phrase>", "evidence_sentence": "<sentence>" }],',
    '    "cons": [{ "phrase": "<short phrase>", "evidence_sentence": "<sentence>" }]',
    '  },',
    '  "confidence": 0.85',
    '}',
    '</preseason_match_json>',
  ].join('\n')
}
```

### `src/server/llm/match/parser.ts`

Reuse the benchmark parser approach with `<preseason_match_json>` tags.

Key exports:

- `MATCH_PARSER_VERSION = 'match-strict-v1'`
- `type MatchParseResult = { status: 'ok'; response: MatchResponse; rawAppendix: string; naturalResponse: string } | { status: 'invalid_output'; reason: string }`
- `parseMatchResponse(rawContent: string): MatchParseResult`

### `src/server/llm/match/runner.ts`

Executes all evaluations for a single batch.

Key requirements:

- Load model snapshots from the season's frozen model set via `benchmarkSeasonModels`
- Run each model twice with presentation order swapped
- Apply the same model drift checks used by `src/server/llm/benchmark/runner.ts`
- Store the same execution metadata shape already used for `benchmarkCaseResults`
- Map `winner = 'tool_a'` back to canonical tool IDs based on `presentation_order`

### `src/server/llm/match/batches.ts`

Create and claim batches safely.

Key exports:

- `createMatchBatch(input)` — canonicalizes tool order, validates category membership, writes an idempotent batch
- `runMatchBatch(batchId)` — executes a claimed batch
- `buildBenchmarkRunIdempotencyKey(runId, configId, promptTemplateId)` — helper for future automated triggers

This helper is the main guard against duplicate benchmark-linked batches.

Execution ownership and reclaim rules:

- Claim by atomically updating from `pending`/`failed` (or from stale `running`) to `running`, setting `started_at`, fresh `claim_token`, and `last_heartbeat_at = now()`
- Treat `running` as stale when `last_heartbeat_at` is older than a configurable threshold (default: 10 minutes), allowing safe reclaim after worker crashes
- While executing, heartbeat-update `last_heartbeat_at` on an interval (for example, every 60 seconds) using `where id = ? and claim_token = ?`
- Finalization updates (`completed`, `failed`, counters, `completed_at`) must also use `where id = ? and claim_token = ?`; if zero rows are affected, treat ownership as lost and return the latest stored batch state instead of writing stale results

### `src/server/api/routers/match.ts`

Admin-only router for configuration and execution.

Procedures:

```typescript
configureMatch:
  // Upsert recurring config for a season/category/tool pair

listConfigs:
  // List configs for a season

disableConfig:
  // Soft-delete a config by setting is_active = false

createBatch:
  // Create a one-off or config-backed batch
  // Accept optional idempotencyKey
  // Does NOT execute the batch — only writes the pending row

listBatches:
  // Paginated admin list

getBatch:
  // Full batch details with evaluations
```

Batch execution should **not** be exposed as a tRPC mutation. A single batch runs `2 × seasonModels` LLM calls (one per presentation order per model), which can easily exceed request/runtime limits or cause client disconnects. Instead, execution happens through a dedicated API route (see below).

### `src/app/api/match-run/route.ts`

Dedicated API route for executing match batches, following the same pattern as `src/app/api/cron/benchmark-run/route.ts`.

```typescript
// POST /api/match-run
// Body: { batchId: string }
// Auth: admin only (validate via Supabase session)
//
// 1. Validate batchId and admin session
// 2. Claim or reclaim stale batch execution (set status = 'running', set claimToken + heartbeat)
// 3. Call runMatchBatch(batchId)
// 4. Return batch summary
//
// This runs server-side without tRPC request limits.
// The admin UI calls this endpoint after creating a batch via tRPC.
```

This keeps batch creation (tRPC, instant) separate from batch execution (API route, long-running). The admin workflow is: create a batch via `match.createBatch`, then trigger execution via `POST /api/match-run`.

---

## Modified Files

### `src/server/db/schema.ts`

- Add the enums listed above
- Add `matchPromptTemplates`, `matchConfigs`, `matchBatches`, and `matchEvaluations`
- Use `jsonb` for tool-scoped evidence arrays
- Add the relations for all new tables

### `src/server/api/root.ts`

- Register the `match` router

### No Public Route Changes In V1

Do not change:

- `src/server/api/routers/benchmark-match.ts`
- `src/app/api/cron/benchmark-run/route.ts`

If direct match data needs to be shown later, add a separate read path or a summarized public field after the data contract has stabilized.

---

## Bias Mitigation Details

Each matchup runs twice per model with tool order swapped:

1. `a_first`: prompt presents tool A first
2. `b_first`: prompt presents tool B first

When mapping back to canonical tool IDs:

- In `a_first`, `winner = 'tool_a'` means `winnerId = toolAId`
- In `b_first`, `winner = 'tool_a'` means `winnerId = toolBId`

Order consistency should be computed in query code, not stored as the source of truth.

---

## Implementation Order

1. Add enums and tables to `src/server/db/schema.ts` with `jsonb` fields for structured evidence
2. Run `pnpm run db:generate` then `pnpm run db:migrate`
3. Create `src/server/llm/match/schema.ts` with Zod validation and tests
4. Create `src/server/llm/match/prompt-builder.ts` and tests
5. Create `src/server/llm/match/parser.ts` and tests
6. Create `src/server/llm/match/batches.ts` for idempotent batch creation and execution claiming
7. Create `src/server/llm/match/runner.ts` and tests
8. Create `src/server/api/routers/match.ts` and tests
9. Create `src/app/api/match-run/route.ts` for batch execution
10. Register the router in `src/server/api/root.ts`
11. Add a separate future task for automated benchmark-run triggers once the manual workflow is stable

---

## Verification

1. `pnpm run db:generate`
2. `pnpm run db:migrate`
3. `pnpm run check`
4. `pnpm run test`
5. Manual test: create a one-off batch, run it, and verify both presentation orders are stored for every season model
6. Manual test: create the same batch twice with the same `idempotencyKey` and verify the existing batch is returned
7. Manual test: inspect one evaluation and confirm `appendix_json`, `natural_response`, and execution metadata are stored
8. Manual test: verify both tools in the matchup belong to the selected category before batch creation succeeds
9. Manual test: start a batch run, kill the worker mid-run, wait past the stale threshold, then rerun and verify the stale batch is reclaimed and completed without manual DB edits

---

## Future Follow-Up

Once the direct evaluation contract proves stable:

- Add a background trigger for benchmark-linked configs
- Keep automated batch creation idempotent
- Add a dedicated public match page read model for a category plus tool pair
- Keep passive H2H stats and direct evaluation results together on that page
- Include critic comments that target the matchup itself, not just the underlying tools

### Public Match Page Follow-Up

The follow-up public experience should likely be implemented as a dedicated match read path, not just by overloading `benchmarkMatch.headToHead`.

Recommended scope for that follow-up:

- A public match page for a canonical `category + toolA + toolB` pair
- Passive benchmark H2H stats
- Direct match evaluation summaries and historical batches for the same pair
- Model and prompt breakdowns where useful
- Critic comments attached to the match itself

This follow-up will also require comment system changes:

- Add `'match'` to `commentTargetEnum`
- Update `src/server/api/routers/comment.ts` target validation and create/listByTarget handling to support `targetType = 'match'`
- Extend `displayableTargetWhere` in `comment.listRecent` so match-targeted comments are included in public recent-comment reads
- Extend `comment.listRecent` target loading and context rendering branches so match comments render label/sublabel/href instead of being dropped
- Decide on the stable match identity used for comments and page queries

The simplest public API shape is likely a dedicated public match query, such as `matchPublic.getBySlug`, rather than turning `benchmarkMatch.headToHead` into the page's one payload for everything.

Do not move to automated triggering until duplicate prevention and observability are in place.
