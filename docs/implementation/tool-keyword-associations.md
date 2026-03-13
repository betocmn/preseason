# Tool Keyword & Brand Associations — Tracksuit-Style Data from LLM Reasoning

## Context

Every time the benchmark system asks an LLM to recommend a tool for a category, the response includes a `reasoning` field explaining **why** that tool was chosen. This text is stored in `benchmarkCaseDecisions.reasoning` but is **never analyzed or surfaced** — it's sitting unused in the database.

Similarly, the [Match Evaluations feature](./match-evaluations.md) (separate implementation) generates structured reasoning and per-tool strengths when LLMs directly compare two tools.

This feature extracts **keywords and phrases** that LLMs associate with each tool — building a dataset similar to what [Tracksuit.com](https://tracksuit.com) produces for consumer brands via human surveys, but derived from LLM responses. Example output:

> **Supabase** — "easy setup" (85%), "good docs" (72%), "PostgreSQL-native" (95%), "limited enterprise features" (-0.4 sentiment)

This is a **data foundation only** — no UI is needed. The schema and extraction pipeline are built so that future UI and analysis can query the data.

---

## Schema Changes

All changes go in `src/server/db/schema.ts` following existing patterns (`createTable` from `pgTableCreator`, UUID primary keys, `$defaultFn(() => new Date())` for timestamps).

### New Tables

**`preseason_tool_keyword`** — normalized keyword/phrase dictionary:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `phrase` | varchar(255), unique | Normalized: lowercase, trimmed |
| `created_at` | timestamp w/ tz | |

Index on `phrase` for fast lookup.

**`preseason_tool_keyword_association`** — links keywords to tools with frequency and sentiment:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `tool_id` | uuid FK → tools | |
| `keyword_id` | uuid FK → toolKeywords | |
| `category_id` | uuid FK → subcategories, nullable | Optional category scoping |
| `source_type` | varchar(50) | `'benchmark_decision'` or `'match_evaluation'` |
| `sentiment_score` | real | -1.0 (negative) to 1.0 (positive) |
| `occurrence_count` | integer, default 1 | Incremented on each extraction |
| `example_excerpts` | text, nullable | JSON array of sample reasoning quotes (capped at 5) |
| `last_seen_at` | timestamp w/ tz | |
| `created_at` | timestamp w/ tz | |

Constraints:
- Unique on `(tool_id, keyword_id, category_id, source_type)` — one aggregate row per combination
- Note: `category_id` nullable means the unique index needs a `COALESCE` or partial index approach. Use `nulls not distinct` or split into two indexes.

Indexes:
- `(tool_id, source_type)` — for querying all keywords for a tool
- `(keyword_id)` — for reverse lookup (which tools have this keyword)
- `(category_id, tool_id)` — for category-scoped queries

**`preseason_keyword_extraction_log`** — idempotency tracking for processed records:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `source_type` | varchar(50) | `'benchmark_case_decision'` or `'match_evaluation'` |
| `source_id` | uuid | The ID of the decision or evaluation that was processed |
| `extracted_at` | timestamp w/ tz | |
| `keyword_count` | integer | How many keywords were extracted |

Constraints:
- Unique on `(source_type, source_id)` — ensures each record is only processed once

### Relations

- `toolKeywordAssociations` → tool, keyword, category
- `keywordExtractionLogs` — standalone (queried by source_type + source_id)

---

## New Files

### `src/server/llm/keywords/schema.ts`

Zod schema for the keyword extraction LLM response.

```typescript
import { z } from 'zod'

export const keywordExtractionResponseSchema = z.object({
  schema_version: z.literal('keyword-extraction-v1'),
  keywords: z.array(
    z.object({
      phrase: z.string().min(1).max(100),
      sentiment: z.number().min(-1).max(1),
    })
  ).min(0).max(20),
})

export type KeywordExtractionResponse = z.infer<typeof keywordExtractionResponseSchema>

export function validateKeywordExtractionResponse(
  data: unknown,
): { success: true; data: KeywordExtractionResponse } | { success: false; error: string } {
  const parsed = keywordExtractionResponseSchema.safeParse(data)
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join('; ') }
  }
  return { success: true, data: parsed.data }
}
```

### `src/server/llm/keywords/extractor.ts`

Calls a cheap LLM to extract keywords and sentiment from reasoning text.

```typescript
import type { LlmService } from '~/server/llm/service'
import { validateKeywordExtractionResponse, type KeywordExtractionResponse } from './schema'

export type ExtractionInput = {
  reasoning: string
  toolName: string
  categoryName: string
}

export type ExtractionResult =
  | { status: 'ok'; keywords: KeywordExtractionResponse['keywords'] }
  | { status: 'failed'; error: string }

// The model used for extraction is configurable
export const DEFAULT_EXTRACTION_MODEL = 'meta-llama/llama-3.1-8b-instruct'
export const DEFAULT_EXTRACTION_PROVIDER = 'meta'

export async function extractKeywords(
  llmService: LlmService,
  input: ExtractionInput,
  options?: { model?: string; provider?: string },
): Promise<ExtractionResult> {
  const model = options?.model ?? DEFAULT_EXTRACTION_MODEL
  const provider = options?.provider ?? DEFAULT_EXTRACTION_PROVIDER

  const prompt = buildExtractionPrompt(input)

  // Call LLM — no XML tags needed, just expect raw JSON
  // Parse response as JSON, validate against schema
  // Return extracted keywords
}

function buildExtractionPrompt(input: ExtractionInput): string {
  return [
    `Extract keywords and phrases that describe "${input.toolName}" from the following reasoning text.`,
    `The context is a recommendation for the "${input.categoryName}" category.`,
    '',
    'For each keyword/phrase:',
    '- Use canonical, lowercase phrasing (e.g., "easy setup" not "Easy to Set Up")',
    '- Assign a sentiment score: -1.0 (very negative) to 1.0 (very positive)',
    '- Focus on tool characteristics, not generic praise',
    '- Combine similar phrases (e.g., "easy to use" and "ease of use" → "easy to use")',
    '- Extract 3-10 keywords. Return fewer if the text is short.',
    '',
    'Reasoning text:',
    '"""',
    input.reasoning,
    '"""',
    '',
    'Respond with ONLY valid JSON, no other text:',
    '{',
    '  "schema_version": "keyword-extraction-v1",',
    '  "keywords": [',
    '    { "phrase": "easy setup", "sentiment": 0.8 },',
    '    { "phrase": "limited customization", "sentiment": -0.4 }',
    '  ]',
    '}',
  ].join('\n')
}
```

**Note on model choice:** The extraction model is configurable. Default to a cheap, fast model. The extraction is simple structured extraction — it doesn't need a frontier model. The provider should route through `LlmService` (from `src/server/llm/service/index.ts`) using the standard `CompletionRequest` type from `src/server/llm/service/types.ts`.

### `src/server/llm/keywords/processor.ts`

Batch processes unextracted reasoning records and upserts keyword associations.

```typescript
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '~/server/db/schema'
import type { LlmService } from '~/server/llm/service'

type DatabaseClient = PostgresJsDatabase<typeof schema>

export type ProcessorOptions = {
  database?: DatabaseClient
  llmService?: LlmService
  batchSize?: number          // default: 50
  sourceType?: 'benchmark_case_decision' | 'match_evaluation' | 'all'  // default: 'all'
  model?: string              // override extraction model
  provider?: string           // override extraction provider
}

export type ProcessorResult = {
  processed: number
  skipped: number             // already in extraction_log
  failed: number
  keywordsExtracted: number
  errors: string[]
}

export async function processUnextractedRecords(
  options?: ProcessorOptions,
): Promise<ProcessorResult> {
  // 1. Query records that have reasoning text but no entry in keyword_extraction_log
  //
  //    For benchmark_case_decision:
  //      SELECT d.id, d.reasoning, d.tool_id, d.category_id, t.name as tool_name, c.name as category_name
  //      FROM preseason_benchmark_case_decision d
  //      JOIN preseason_tool t ON d.tool_id = t.id
  //      JOIN preseason_subcategory c ON d.category_id = c.id
  //      LEFT JOIN preseason_keyword_extraction_log l
  //        ON l.source_type = 'benchmark_case_decision' AND l.source_id = d.id
  //      WHERE d.reasoning IS NOT NULL
  //        AND d.decision_type = 'tool'
  //        AND d.tool_id IS NOT NULL
  //        AND l.id IS NULL
  //      LIMIT {batchSize}
  //
  //    For match_evaluation (from match-evaluations feature):
  //      Similar query against preseason_match_evaluation where reasoning IS NOT NULL
  //      Note: match_evaluation has tool_a and tool_b — extract keywords for BOTH tools
  //
  // 2. For each record, call extractKeywords()
  //
  // 3. For each extracted keyword:
  //    a. Upsert into tool_keyword (normalize phrase: lowercase, trim)
  //    b. Upsert into tool_keyword_association:
  //       - If exists: increment occurrence_count, update last_seen_at, append to example_excerpts (cap at 5)
  //       - If new: insert with occurrence_count = 1
  //
  // 4. Insert into keyword_extraction_log for idempotency
  //
  // 5. Return summary
}
```

**Important:** For `match_evaluation` records, each evaluation contains strengths for **both** tools. Extract keywords for both `tool_a_strengths` and `tool_b_strengths`, associating them with the correct tool ID. Also process the general `reasoning` field, attributing keywords to the winner tool.

### `src/server/api/routers/keyword.ts`

tRPC router for admin management and public querying.

```typescript
// Admin procedures (require admin role):

triggerExtraction:
  // Input: optional sourceType filter, optional batchSize
  // Calls processUnextractedRecords()
  // Returns ProcessorResult

getExtractionStatus:
  // Returns: { totalDecisionsWithReasoning, totalExtracted, pending }
  // Counts from benchmark_case_decisions + match_evaluations vs extraction_log

// Public procedures:

getToolKeywords:
  // Input: toolSlug, optional categorySlug, optional limit (default 20)
  // Returns: Array<{ phrase, sentimentScore, occurrenceCount, sourceType }>
  // Ordered by occurrenceCount desc
  // This powers future UI — no UI needed now

getToolKeywordsByCategory:
  // Input: toolSlug
  // Returns: Map<categorySlug, Array<{ phrase, sentimentScore, occurrenceCount }>>
  // Grouped view for tool profile pages
```

---

## Modified Files

### `src/server/db/schema.ts`
- Add 3 new tables: `toolKeywords`, `toolKeywordAssociations`, `keywordExtractionLogs`
- Add relations for all 3 tables

### `src/server/api/root.ts`
- Import and register the `keyword` router:
```typescript
import { keywordRouter } from '~/server/api/routers/keyword'
// ...
keyword: keywordRouter,
```

---

## Handling Match Evaluation Source Type

The `source_type = 'match_evaluation'` assumes the [Match Evaluations feature](./match-evaluations.md) has been implemented. If building this feature first:
- Define the source type enum to include `'match_evaluation'` but only implement processing for `'benchmark_case_decision'` initially
- The `match_evaluation` processing path can be added after that feature ships
- The schema supports both from day one

---

## Implementation Order

1. Add tables to `src/server/db/schema.ts` with relations
2. Run `pnpm run db:generate` then `pnpm run db:migrate`
3. Create `src/server/llm/keywords/schema.ts` with Zod validation + tests
4. Create `src/server/llm/keywords/extractor.ts` + tests (mock LLM calls in tests)
5. Create `src/server/llm/keywords/processor.ts` + tests (use Testcontainers for DB tests)
6. Create `src/server/api/routers/keyword.ts` + tests
7. Register router in `src/server/api/root.ts`

---

## Verification

1. `pnpm run db:generate` — generates clean migration
2. `pnpm run db:migrate` — applies without errors
3. `pnpm run check` — no lint or type errors
4. `pnpm run test` — all existing + new colocated tests pass
5. Manual test: trigger extraction via tRPC, verify keywords are extracted and associations are created
6. Manual test: call `keyword.getToolKeywords` for a tool that has been processed, verify keyword data returns
7. Idempotency test: run extraction twice, verify `occurrence_count` doesn't double and extraction_log prevents reprocessing

---

## Key Reference Files

| File | Pattern to follow |
|------|-------------------|
| `src/server/db/schema.ts` | Table definitions, `createTable`, enums, relations, index patterns |
| `src/server/llm/benchmark/schema.ts` | Zod response schema + validation function |
| `src/server/llm/service/index.ts` | `LlmService` class, `complete()` method |
| `src/server/llm/service/types.ts` | `CompletionRequest`, `CompletionResponse` types |
| `src/server/api/routers/benchmark-admin.ts` | Admin-only tRPC procedures, role checks, pagination |
| `src/server/api/routers/tool.ts` | Public tool query patterns |
| `src/server/db/schema.ts` lines 598-628 | `benchmarkCaseDecisions` table — the source of reasoning text |
