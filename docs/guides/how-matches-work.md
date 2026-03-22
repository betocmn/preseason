# How Matches Work

This document explains Preseason's match evaluation system — head-to-head
comparisons where LLMs directly evaluate two tools against each other within
a category, producing structured pros/cons and a winner decision.

## Overview

While the benchmark pipeline asks "Which tool would you recommend?" across many
categories, the match system asks a more focused question: **"Given these two
specific tools in the same category, which one is better and why?"**

Matches produce rich qualitative data — evidence-backed pros and cons for each
tool — that complements the quantitative rankings from benchmarks. Think of
benchmarks as the regular season and matches as the playoffs.

## Key Concepts

### Prompt Templates

Immutable markdown templates that define how a comparison question is framed.
Templates use three placeholders:

- `{{TOOL_A}}` — the first tool's name
- `{{TOOL_B}}` — the second tool's name
- `{{CATEGORY}}` — the category/subcategory name

Each template also stores a `systemPromptSnapshot` (optional system prompt sent
to the LLM) and a `schemaVersion` (currently `match-v2`). Only one template can
be active at a time, enforced by a partial unique index on `isActive = true`.

### Match Configs

A config ties together a season, category, tool pair, and prompt template. It
represents the intent to compare two specific tools — the "matchup" definition.

Configs enforce canonical tool ordering: `toolAId < toolBId` at both the
application and database level. This ensures Supabase vs Firebase and Firebase
vs Supabase are treated as the same matchup.

Only one active config can exist per `(season, category, toolA, toolB)` combo,
enforced by a partial unique index.

### Match Batches

A batch is one execution unit — it materializes all the individual LLM
evaluations needed to compare two tools. When created, the batch:

1. Validates both tools belong to the specified category
2. Confirms the season has frozen model snapshots
3. Creates two evaluations per model (for bias mitigation — see below)

Batches support idempotency via an optional `idempotencyKey`. If a batch with
the same key already exists and its dimensions (season, category, tools, template)
match, the existing batch is returned instead of creating a duplicate.

Batch lifecycle: `pending` → `running` → `completed` or `failed`

### Match Evaluations

The atomic unit of match data — one LLM call comparing two tools. Each evaluation
stores the complete LLM interaction: prompt sent, raw response, parsed appendix,
token usage, latency, model metadata, and the structured result (winner, pros/cons,
confidence).

Evaluation statuses: `pending`, `completed`, `failed`, `invalid_output`

### Trigger Modes

Batches can be created in two ways:

- `manual` — an admin creates the batch via the tRPC API
- `benchmark_run` — automatically triggered alongside a benchmark run (uses
  `idempotencyKey` for deduplication)

## The Match Prompt Contract

The LLM receives a rendered prompt template with tool names and category
substituted in, followed by structured output instructions. The model must return
a natural language comparison followed by a machine-readable appendix:

```
[Natural language comparison of the two tools...]

---

IMPORTANT: After your natural-language answer, you MUST include a machine-readable appendix.
Wrap it exactly between the XML tags shown below. The JSON must be valid and complete.

In the JSON, "tool_a" refers to the FIRST tool mentioned and "tool_b" refers to the SECOND tool.
For each tool, list up to 8 pros and 8 cons with short phrases and evidence sentences.

<preseason_match_json>
{
  "schema_version": "match-v2",
  "winner": "tool_a",
  "comparison_summary": "Supabase edges out Firebase for this use case due to...",
  "tool_a": {
    "pros": [
      {
        "phrase": "Native row-level security",
        "evidence_sentence": "Supabase provides Postgres RLS policies that enforce access control at the database layer."
      }
    ],
    "cons": [
      {
        "phrase": "Smaller ecosystem",
        "evidence_sentence": "Fewer third-party integrations and community plugins compared to Firebase."
      }
    ]
  },
  "tool_b": {
    "pros": [
      {
        "phrase": "Mature real-time database",
        "evidence_sentence": "Firebase Realtime Database has years of production use in large-scale apps."
      }
    ],
    "cons": [
      {
        "phrase": "Vendor lock-in risk",
        "evidence_sentence": "Firebase's proprietary APIs make migration difficult if you outgrow the platform."
      }
    ]
  },
  "confidence": 0.82
}
</preseason_match_json>
```

### Validation Rules

- `schema_version` must be exactly `match-v2`
- `winner` must be `tool_a`, `tool_b`, `tie`, or `abstain`
- `comparison_summary` is required and non-empty
- Each tool can have up to 8 pros and 8 cons
- Each pro/con has a `phrase` (max 100 chars) and `evidence_sentence` (max 280 chars)
- `confidence` must be between 0.0 and 1.0

**There is no heuristic parsing.** If the appendix is malformed, the evaluation
is marked `invalid_output`. The system never guesses what the model meant.

## Bias Mitigation

LLMs exhibit **position bias** — a tendency to favor whichever option is
presented first. The match system mitigates this by running each model
comparison twice with swapped presentation order:

| Evaluation | Prompt shows | `presentationOrder` |
|------------|-------------|---------------------|
| 1 | "Compare **Supabase** vs **Firebase**..." | `a_first` |
| 2 | "Compare **Firebase** vs **Supabase**..." | `b_first` |

For `a_first` evaluations, the LLM response maps directly to canonical
positions (tool_a in the response = Tool A in the database).

For `b_first` evaluations, the system **remaps** everything back to canonical
positions:

- Winner `tool_a` → mapped to `tool_b` (because the LLM's "first tool" is
  actually the canonical Tool B)
- Winner `tool_b` → mapped to `tool_a`
- `tie` and `abstain` remain unchanged
- All pros/cons are swapped to their canonical tool positions

This means downstream consumers always see data in canonical `(toolA, toolB)`
order regardless of how the prompt was presented. Comparing the two evaluations
per model reveals how much position bias influenced each model's decision.

## Execution Pipeline

### 1. Batch Creation (Admin Action)

An admin creates a batch via the `match.createBatch` tRPC procedure:

```
tRPC match.createBatch
  → Canonicalizes tool order (toolAId < toolBId)
  → Validates tools belong to category
  → Checks season has frozen model snapshots
  → Idempotency check (if key provided)
  → Creates batch record (status: pending)
  → Materializes 2N evaluations (N = number of models in season)
```

If the season has 8 model snapshots, the batch creates 16 evaluations
(2 per model: one `a_first`, one `b_first`).

### 2. Batch Claiming (Cron Trigger)

A cron job calls `POST /api/match-run` to execute a pending batch:

```
POST /api/match-run
  Authorization: Bearer <CRON_SECRET>
  Body: { "batchId": "uuid" }
```

The claim mechanism provides concurrency safety:

- **Pending/failed batches**: Claimed immediately, transitions to `running`,
  generates a `claimToken` (UUID)
- **Stale running batches**: If `lastHeartbeatAt` is older than 10 minutes,
  the batch is reclaimed with a new token (handles crashed workers)
- **Actively running batches**: Rejected to prevent double execution
- **Completed batches**: Returns early with current status

### 3. Batch Execution (Runner)

The runner processes all retryable evaluations (`pending`, `failed`,
`invalid_output`) sequentially:

```
For each retryable evaluation:
  1. Load prompt template, tool names, category name, model snapshot config
  2. Build prompt (swap tool names based on presentationOrder)
  3. Generate SHA-256 prompt hash (first 64 chars) for auditing
  4. Call LLM via LlmService.complete()
  5. Check for model drift (requested vs returned model ID)
  6. Parse response — extract JSON from <preseason_match_json> tags
  7. Validate against Zod schema
  8. Remap results if b_first (bias mitigation)
  9. Persist in transaction with ownership verification
```

**Heartbeat pattern**: Every 60 seconds, the runner updates `lastHeartbeatAt`
on the batch record (guarded by `WHERE claim_token = ?`). If the heartbeat
update affects zero rows, it means ownership was lost — the runner stops
immediately.

**Ownership verification**: Before persisting each evaluation result, the
runner acquires a `SELECT ... FOR UPDATE` lock on the batch and verifies the
claim token still matches. This prevents lost updates from zombie workers.

### 4. Finalization

After processing all evaluations:

- If **all** evaluations are `completed` → batch status = `completed`
- Otherwise → batch status = `failed` (with counts of failed/invalid evaluations)
- `completedAt` timestamp is set
- Final counts are persisted on the batch record

## Cron Setup

The match execution endpoint is designed to be called by an external cron
scheduler (e.g., Vercel Cron, GitHub Actions, or a manual trigger):

```bash
# Execute a specific batch
curl -X POST https://your-app.com/api/match-run \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"batchId": "550e8400-e29b-41d4-a716-446655440000"}'
```

**Authentication**: The endpoint uses Bearer token auth against the
`CRON_SECRET` environment variable. This is intentionally separate from
Supabase session auth — cron jobs don't have user sessions.

**Response format**:

```json
{
  "ok": true,
  "summary": {
    "batchId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "totalEvaluations": 16,
    "completedEvaluations": 16,
    "failedEvaluations": 0,
    "invalidOutputEvaluations": 0
  }
}
```

**Typical cron workflow**:

1. Admin creates batches via the tRPC API (or they are auto-triggered by
   benchmark runs)
2. A scheduled job queries for pending batches and calls `/api/match-run`
   for each one
3. If a batch fails or a worker crashes, the next cron invocation reclaims
   the stale batch and retries

## Admin tRPC API

All procedures require the `admin` role.

| Procedure | Type | Description |
|-----------|------|-------------|
| `match.configureMatch` | mutation | Create a match config for a season/category/tool pair |
| `match.listConfigs` | query | List configs for a season (paginated) |
| `match.disableConfig` | mutation | Deactivate a match config |
| `match.createBatch` | mutation | Create a batch (materializes evaluations, does NOT execute) |
| `match.listBatches` | query | List batches with optional season/status filters |
| `match.getBatch` | query | Get a batch with all evaluations and relations |

## Database Schema

All tables use the `preseason_` prefix.

### Enums

| Enum | Values |
|------|--------|
| `match_batch_status` | `pending`, `running`, `completed`, `failed` |
| `match_trigger_mode` | `manual`, `benchmark_run` |
| `match_evaluation_status` | `pending`, `completed`, `failed`, `invalid_output` |
| `match_winner_decision` | `tool_a`, `tool_b`, `tie`, `abstain` |
| `match_presentation_order` | `a_first`, `b_first` |

### Tables

- **`match_prompt_template`** — versioned prompt templates with placeholders
- **`match_config`** — which tools to compare in which season/category
- **`match_batch`** — execution units with status, claim token, heartbeat, counters
- **`match_evaluation`** — individual LLM calls with full request/response audit trail

### Key Constraints

- `tool_a_id < tool_b_id` — enforced via CHECK constraint on configs, batches,
  and evaluations to prevent duplicate matchups
- Partial unique on `(season, category, toolA, toolB) WHERE isActive = true` —
  only one active config per matchup
- Unique on `(batchId, modelSnapshotId, presentationOrder)` — prevents duplicate
  evaluations within a batch
- Composite foreign keys cross-reference season IDs to prevent cross-season
  data corruption

## Error Handling

| Scenario | Evaluation Status | Batch Impact |
|----------|------------------|--------------|
| LLM API error | `failed` | Batch marked `failed` at finalization |
| Malformed JSON response | `invalid_output` | Batch marked `failed` at finalization |
| Wrong `schema_version` | `invalid_output` | Batch marked `failed` at finalization |
| Model drift detected | `invalid_output` | Batch marked `failed` at finalization |
| Worker crash mid-execution | Evaluations stay `pending` | Batch reclaimed after 10min stale threshold |
| Ownership lost (another worker claimed) | Processing stops | Runner returns `ownership_lost` status |

Failed and `invalid_output` evaluations are retryable — re-running the batch
via `/api/match-run` will reattempt them while skipping already-completed ones.

## Relationship to Benchmarks

Matches and benchmarks are complementary systems that share infrastructure:

| Aspect | Benchmarks | Matches |
|--------|-----------|---------|
| Question | "Which tool for this scenario?" | "Which of these two tools is better?" |
| Output | Tool choice per category | Winner + pros/cons with evidence |
| Scope | All categories in a prompt | One category, two tools |
| Data type | Quantitative (support rates) | Qualitative (evidence sentences) |
| Shared | LlmService, model snapshots, seasons, model drift detection | Same |
| Parser tag | `<preseason_benchmark_json>` | `<preseason_match_json>` |
