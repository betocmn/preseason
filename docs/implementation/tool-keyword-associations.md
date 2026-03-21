# Tool Keyword & Brand Associations — Tracksuit-Style Data from LLM Reasoning

## Context

The benchmark system already stores reasoning in `benchmarkCaseDecisions.reasoning`, but that text is not analyzed or surfaced anywhere today.

The direct match evaluation plan in `match-evaluations.md` adds a better source of structured qualitative data: each match response will contain tool-scoped pros and cons with evidence sentences. That data is a much stronger foundation for later brand analysis than freeform comparison text.

The goal of this feature is to generate later-analysis data that answers questions like:

- What phrases do models associate with a tool?
- Are those associations positive or negative?
- What evidence sentences support those phrases?
- How do those associations differ by category or source type?

## Recommendation Summary

Do not store only mutable aggregate counts in v1. Store source-level mention rows first, then derive rollups later.

- Match evaluations should be ingested directly from structured `appendix_json`
- Benchmark decision reasoning can be backfilled separately with a cheap extraction model
- Every extracted mention should keep source IDs, source field, evidence, and extractor version
- Rollups should be query-derived or added later as a view or materialized view
- No public UI or public route changes are needed in the first version

This is the data model that best supports future analysis, reprocessing, and prompt evolution.

## Data Sources

### Primary Source: Direct Match Evaluations

These are the best source of association data because they are already tool-scoped:

- `tool_a.pros`
- `tool_a.cons`
- `tool_b.pros`
- `tool_b.cons`

Each item includes both a short phrase and an evidence sentence, so no second LLM pass is needed for this source.

### Secondary Source: Benchmark Case Decisions

These are useful for broader coverage, but they are less structured because the current contract stores only one `reasoning` string per chosen tool. Use them as a backfill path, not as the primary source for the first version.

---

## Schema Changes

All changes go in `src/server/db/schema.ts` following existing patterns. Use append-only rows and versioned processing state instead of mutable occurrence counters.

### New Enums

```typescript
export const associationSourceTypeEnum = pgEnum('association_source_type', [
  'match_evaluation',
  'benchmark_case_decision',
])

export const associationSourceFieldEnum = pgEnum('association_source_field', [
  'tool_a_pro',
  'tool_a_con',
  'tool_b_pro',
  'tool_b_con',
  'decision_reasoning',
])

export const associationSourceStateStatusEnum = pgEnum('association_source_state_status', [
  'running',
  'completed',
  'failed',
])
```

### New Tables

**`preseason_tool_association_mention`** — one extracted phrase or sentence association

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `source_type` | associationSourceTypeEnum | |
| `source_id` | uuid | `matchEvaluation.id` or `benchmarkCaseDecision.id` |
| `source_field` | associationSourceFieldEnum | Which part of the source generated the mention |
| `source_position` | integer, nullable | Position within a pros or cons array |
| `extractor_version` | varchar(50) | e.g. `"match-ingest-v1"` or `"decision-extract-v1"` |
| `tool_id` | uuid FK → tools | |
| `category_id` | uuid FK → subcategories | |
| `season_id` | uuid FK → benchmarkSeasons | Both source types are season-scoped; denormalized here so rollup queries can filter by season without joining back through polymorphic source tables |
| `benchmark_run_id` | uuid FK → benchmarkRuns, nullable | Useful for time slicing when available; constrained with `season_id` so a mention cannot point at a run from a different season |
| `model_snapshot_id` | uuid FK → benchmarkModelSnapshots, nullable | Constrained with `season_id` so a mention cannot point at a model outside the season's frozen model set |
| `phrase` | varchar(100) | Original extracted phrase |
| `normalized_phrase` | varchar(100) | Lowercase, trimmed canonical form |
| `sentiment_score` | real | -1.0 to 1.0 |
| `evidence_sentence` | text, nullable | Supporting sentence |
| `created_at` | timestamp w/ tz | |

Constraints:

- Unique on `(source_type, source_id, source_field, source_position, tool_id, normalized_phrase, extractor_version)` with `NULLS NOT DISTINCT` — this is required because `benchmark_case_decision` mentions have `source_position = NULL`, and PostgreSQL treats NULL as distinct by default, which would allow duplicate rows on reprocessing. `NULLS NOT DISTINCT` (PostgreSQL 15+, supported by Supabase) treats NULLs as equal for uniqueness
- `category_id` should be non-null for both supported source types
- Composite FK on `(benchmark_run_id, season_id)` referencing `benchmarkRuns(id, season_id)` — prevents denormalized run and season values from drifting across seasons. Add a lightweight unique index on `benchmarkRuns(id, season_id)` (similar to `matchBatches(id, season_id)` in `match-evaluations.md`) so PostgreSQL can enforce this FK
- Composite FK on `(season_id, model_snapshot_id)` referencing `benchmarkSeasonModels(season_id, model_snapshot_id)` — enforces that any non-null model snapshot belongs to the same season

Indexes:

- `(season_id, tool_id, category_id)`
- `(normalized_phrase)`
- `(source_type, source_id)`
- `(benchmark_run_id)`

**`preseason_tool_association_source_state`** — versioned processing state per source record

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `source_type` | associationSourceTypeEnum | |
| `source_id` | uuid | |
| `extractor_version` | varchar(50) | |
| `status` | associationSourceStateStatusEnum | |
| `claimed_at` | timestamp w/ tz, nullable | Set when status transitions to `'running'` — used for stale detection |
| `claim_token` | uuid, nullable | Random token set when a worker claims a source; ownership-sensitive heartbeat/finalize updates must include this token |
| `processed_at` | timestamp w/ tz, nullable | Set when status transitions to `'completed'` or `'failed'` |
| `mention_count` | integer, nullable | Set on completion |
| `error_message` | text, nullable | |

Constraints:

- Unique on `(source_type, source_id, extractor_version)`
- Check: when `status = 'running'`, both `claimed_at` and `claim_token` must be non-null

### Why No Aggregate Table In V1

An aggregate table with mutable `occurrence_count` is not the right storage primitive for this feature because it:

- Loses source-level provenance
- Makes reprocessing hard when the extractor changes
- Blocks comparisons across extractor versions
- Makes debugging bad associations harder

If rollups are needed later, build them from `toolAssociationMentions`.

### Relations

- `toolAssociationMentions` → tool, category, season, benchmarkRun, modelSnapshot
- `toolAssociationSourceStates` — standalone, keyed by source type, source id, and extractor version

---

## New Files

### `src/server/tool-associations/types.ts`

Shared types for normalized mention records.

```typescript
export type ToolAssociationMentionInput = {
  sourceType: 'match_evaluation' | 'benchmark_case_decision'
  sourceId: string
  sourceField: 'tool_a_pro' | 'tool_a_con' | 'tool_b_pro' | 'tool_b_con' | 'decision_reasoning'
  sourcePosition?: number
  extractorVersion: string
  toolId: string
  categoryId: string
  seasonId: string
  benchmarkRunId?: string | null
  modelSnapshotId?: string | null
  phrase: string
  sentimentScore: number
  evidenceSentence?: string | null
}
```

### `src/server/tool-associations/match-ingest.ts`

Reads structured match evaluation payloads and writes mention rows directly.

Key behavior:

- Read from `matchEvaluations.appendixJson`
- Ingest `tool_a.pros`, `tool_a.cons`, `tool_b.pros`, `tool_b.cons`
- Do not extract from `comparison_summary`
- Map `tool_a_*` and `tool_b_*` back to canonical tool IDs based on the stored batch and presentation order
- Write mentions with `extractorVersion = 'match-ingest-v1'`

This path should not call an LLM.

### `src/server/tool-associations/extractor.ts`

LLM-assisted extractor for `benchmarkCaseDecisions.reasoning` only.

Expected appendix shape:

```typescript
import { z } from 'zod'

export const associationExtractionResponseSchema = z.object({
  schema_version: z.literal('tool-association-extraction-v1'),
  mentions: z.array(
    z.object({
      phrase: z.string().min(1).max(100),
      sentiment: z.number().min(-1).max(1),
      evidence_sentence: z.string().min(1).max(280),
    }),
  ).max(10),
})
```

Important details:

- Use the same tagged JSON pattern already used by the benchmark pipeline
- Do not expect raw JSON-only output from a cheap model
- Return zero mentions if the reasoning text is too generic to support useful extraction

### `src/server/tool-associations/processor.ts`

Processes sources into mention rows.

```typescript
export type ProcessorOptions = {
  batchSize?: number
  sourceType?: 'match_evaluation' | 'benchmark_case_decision' | 'all'
  extractorVersion?: string
}
```

Behavior:

1. **Claim phase**: Select a batch of eligible sources using `FOR UPDATE SKIP LOCKED` to prevent concurrent workers from claiming the same rows. Eligible sources are those with no `source_state` row for the extractor version, or with `status = 'failed'`, or with `status = 'running'` where `claimed_at` is older than a configurable stale threshold (default: 10 minutes). For `match_evaluation`, additionally require `evaluation.status = 'completed'` and `appendix_json IS NOT NULL`. For `benchmark_case_decision`, require `decision_type = 'tool'` AND `tool_id IS NOT NULL` AND reasoning is present — decisions with `decision_type = 'none'` have no tool to attribute associations to, and including them would either fail inserts (non-null `tool_id` required on mentions) or create meaningless associations. Generate a claim token for the worker and upsert a `source_state` row with `status = 'running'`, `claimed_at = now()`, and that `claim_token` for each claimed source before releasing the lock. This mirrors the claim pattern in `src/server/llm/benchmark/runner.ts:206-255`
2. **Process phase**: For each claimed source, run extraction (direct ingest for match evaluations, LLM call for benchmark decisions). On retry of a previously failed source, delete any partial mention rows from the prior attempt before reinserting. While the batch is running, refresh `claimed_at` on an interval (for example, every 60 seconds) for rows still owned by this worker (`status = 'running'` and matching `claim_token`) so long LLM backfills are not reclaimed mid-flight
3. **Finalize phase**: Update the `source_state` to `'completed'` (with `mention_count` and `processed_at`) or `'failed'` (with `error_message` and `processed_at`) using `where source_type = ? and source_id = ? and extractor_version = ? and claim_token = ?`, then clear `claim_token`. Sources in `'running'` are reclaimable only when `claimed_at` is stale, preventing concurrent workers from stealing active work

Only `status = 'completed'` is terminal. Non-completed evaluations (failed, invalid_output, pending) are never selected. Because processing is versioned, the same source can also be reprocessed with a new extractor version without deleting old data.

### `src/server/api/routers/tool-association.ts`

Admin-first router for backfills and status.

Procedures:

```typescript
backfillMatchAssociations:
  // Process structured match evaluations into mention rows

backfillBenchmarkDecisionAssociations:
  // Run the benchmark reasoning extractor for a batch of decisions

getAssociationStatus:
  // Counts sources, processed states, mentions, and recent failures by source type and extractor version
```

No public query API is required in the first version. If a UI needs this later, it can read from mention rows or from a derived rollup view.

---

## Modified Files

### `src/server/db/schema.ts`

- Add `associationSourceTypeEnum`, `associationSourceFieldEnum`, and `associationSourceStateStatusEnum`
- Add `toolAssociationMentions` and `toolAssociationSourceStates`
- Add relations for the new tables

### `src/server/api/root.ts`

- Register the `toolAssociation` router

### No Mutable Rollup Table In V1

Do not add a `toolKeywordAssociations` aggregate table in the first version. If rollups become necessary, add a view or materialized view built from `toolAssociationMentions`.

---

## Query Patterns For Later Analysis

Example rollup query shape:

- Group by `tool_id`, `category_id`, `normalized_phrase`
- Count mentions
- Average `sentiment_score`
- Sample a few `evidence_sentence` values
- Filter by `source_type`, `benchmark_run_id`, or `model_snapshot_id`

This is enough to support later analysis without locking the storage model into one aggregate shape too early.

---

## Handling Match Evaluation Source Data

For match evaluations:

- Use only `tool_a.pros`, `tool_a.cons`, `tool_b.pros`, and `tool_b.cons`
- Do not attribute `comparison_summary` to the winning tool
- Do not run a second extraction model over match data in v1

This avoids winner-bias and preserves the cleaner structured data already returned by the direct comparison prompt.

---

## Implementation Order

1. Add enums and tables to `src/server/db/schema.ts`
2. Run `pnpm run db:generate` then `pnpm run db:migrate`
3. Create `src/server/tool-associations/types.ts`
4. Create `src/server/tool-associations/match-ingest.ts` and tests
5. Create `src/server/tool-associations/extractor.ts` and tests
6. Create `src/server/tool-associations/processor.ts` and tests
7. Create `src/server/api/routers/tool-association.ts` and tests
8. Register the router in `src/server/api/root.ts`
9. Add a separate future task for rollup views or materialized views if query volume later requires them

---

## Verification

1. `pnpm run db:generate`
2. `pnpm run db:migrate`
3. `pnpm run check`
4. `pnpm run test`
5. Manual test: ingest match evaluations and verify one mention row is created per pros or cons item
6. Manual test: process the same source twice with the same extractor version and verify no duplicate mentions are inserted
7. Manual test: process the same benchmark decision with a new extractor version and verify a second versioned result set can coexist
8. Manual test: group mention rows by `normalized_phrase` and confirm counts and sample evidence sentences look correct

---

## Future Follow-Up

Once mention rows are populated and stable:

- Add a rollup view or materialized view for high-traffic queries
- Add read APIs for tool profile pages or brand dashboards
- Compare associations over time by benchmark run window or model tier

The first version should optimize for source fidelity and reprocessability, not precomputed aggregates.
