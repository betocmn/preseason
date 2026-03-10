# Benchmark V2 Refactoring Plan

## Why this matters

Preseason's current pipeline was built for exploration: send prompts to LLMs, parse
whatever comes back, count mentions, show rankings. That's fine for prototyping but
not for making public claims like "Supabase is the #1 recommended database tool."

The problems are real and well-documented:

1. **Prompts are mutable** — loaded from disk at runtime, never snapshotted per result.
2. **Parsing is best-effort** — natural text first, heuristic extraction, fuzzy matching.
   Partial failures silently corrupt data.
3. **Unknown tools auto-created** — any LLM hallucination becomes a real tool entry.
4. **Rankings are ad-hoc aggregations** — computed from raw recommendation rows with
   hand-tuned composite scores, no statistical rigor.
5. **Matches are recommendation-count duels** — not derived from structured case outcomes.
6. **Runs are not idempotent** — cron creates a fresh run every time, no resume.
7. **Inference params not persisted** — temperature, top_p, max_tokens drift silently
   between provider defaults.
8. **No prompt difficulty weighting** — a trivial "build a todo app" prompt has the same
   influence as a complex multi-service architecture prompt.

This plan rebuilds the methodology as a proper benchmark protocol. Since nothing
is deployed yet, we can aggressively remove legacy code after the new pipeline
is functional — there's no live traffic to worry about.

---

## Key design decisions (where this plan diverges from initial proposal)

### 1. Fewer tables upfront, compute before denormalize

The initial proposal called for 16+ new tables including pre-materialized
`benchmark_leaderboard_snapshots` and `benchmark_head_to_head_snapshots`. This plan
defers those denormalized snapshot tables. Rankings and head-to-heads are computed
directly from `benchmark_case_decisions` until query performance demands otherwise.
This keeps the schema honest and avoids premature optimization.

**Deferred tables:** `benchmark_leaderboard_snapshots`, `benchmark_leaderboard_items`,
`benchmark_head_to_head_snapshots`. These become a follow-up PR once we have real
query patterns and know where materialization pays off.

### 2. Prompt difficulty tiers and model-weighted rankings

Not all prompts are created equal. "Build me a todo app" produces generic,
low-signal recommendations. "Build a multi-tenant SaaS with SOC2 compliance"
forces the model to reason carefully about auth, infra, and observability.

Similarly, a frontier model (GPT-4o, Claude Opus) deliberating on tool choices
carries different signal than a small model pattern-matching on training data.

This plan adds:

- **Prompt difficulty tiers** (`basic`, `intermediate`, `advanced`) scored by
  category count, specificity of requirements, and domain complexity.
- **Model capability tiers** (`frontier`, `mid`, `small`) based on published
  benchmarks and parameter counts.
- **Tier-aware analysis** — public rankings show results filterable by prompt
  difficulty. "What do frontier models recommend for hard problems?" is a more
  defensible claim than "What do all models recommend for all prompts?"

### 3. Prompts live in the database, not on disk

The current system loads prompt markdown from files at runtime. This plan moves
prompts entirely to the database for app runtime and benchmark freezing. The
`prompts` table gets a `content_md` column, and `benchmark_prompt_versions`
snapshot from there. Promptfoo remains file-based until PR 8 to avoid expanding
the scope of PR 2; the markdown files in `src/server/llm/prompts/` are deleted
only once a Promptfoo export/adapter path is added during legacy cleanup.

Because nothing is deployed and all current data is local/dev-only, we do **not**
need a historical backfill or data-preservation migration. Resetting or reseeding
local data is acceptable during this refactor.

### 4. Model weighting infrastructure ships now, but Season 1 launches uniform

Model tiers (`frontier`, `mid`, `small`) and the weighting infrastructure are
built from day one. Weights are stored in a `benchmark_model_weight_configs`
table and snapshotted per run, so results always reference the weight config
that produced them.

However, **Season 1 launches with uniform weights** (all tiers = 1.0). This is
the most defensible position for a public launch:
- "Every model gets one equal vote" is simple, transparent, and hard to attack
- The current 8-model panel is already roughly provider-balanced
- Non-uniform weighting requires justification that we don't yet have data for
- We avoid the Twitter reply: "you're manipulating rankings with arbitrary weights"

Non-uniform weights can be activated for Season 2+ once we've validated tier
classifications against actual benchmark variance. The infrastructure is ready;
the judgment call is deferred until we have evidence.

### 5. Eight PRs, not eleven phases

The initial proposal has 11 phases, several of which are small enough to combine
and some large enough to split. This plan targets 8 PRs that each deliver a
testable, deployable increment. PR 8 is an aggressive legacy cleanup since
nothing is deployed yet. Each PR has a clear "done when" gate.

### 6. Shadow mode accumulation, not synthetic backfill

The initial instinct was to backfill weeks of data in one batch. But running
28 benchmark executions on the same day produces 28 identical data points —
same model versions, same provider behavior, no real temporal variance. It's
technically reproducible but intellectually dishonest.

Instead: land PRs 1-4, then run the benchmark cron daily in shadow mode for
3-4 weeks while the public site still shows exploration data. This produces
genuinely independent daily observations and tests cron reliability. The
public switch happens only after the shadow period meets the launch bar.

### 7. Keep the "overall" ranking but label it clearly

The initial proposal removes the overall ranking entirely. Instead, this plan
keeps it but:
- Labels it "Exploratory Composite" in the UI
- Removes it from any "benchmark-grade" claims
- Category-level rankings are the authoritative benchmark output

---

## Launch bar

Do not switch public pages to benchmark data until ALL of these are true:

| Requirement | Threshold |
|-------------|-----------|
| Published daily runs in active season | >= 21 (target 28) |
| Eligible prompt versions per public category | >= 3 |
| Eligible benchmark decisions per public category | >= 100 |
| Completed model snapshots per public category | >= 3 |
| Decisive trials per published head-to-head | >= 30 |
| Methodology page | Live, listing prompt panel, model panel, scoring version |
| Weight snapshot transparency | If weighted, methodology lists exact config used |
| Unresolved tool backlog | Not threatening QC pass rate |
| Model snapshot drift incidents | Zero in published runs |

Categories below the coverage bar show "Insufficient benchmark data" instead
of pretending to be authoritative. This is better than hiding them — it signals
the benchmark is honest about its limits.

These thresholds are deliberately strict for first release. They can be relaxed
later with justification.

---

## Terminology

| Term | Meaning |
|------|---------|
| **Protocol** | Versioned methodology definition (parser version, scoring rules, prompt contract) |
| **Season** | A frozen panel of prompt versions + model snapshots. Think of it as a benchmark edition |
| **Run** | One execution batch on one date within a season. Idempotent by `(season, date)` |
| **Case** | One prompt-version × model-snapshot pair within a season |
| **Case result** | The LLM output for one case in one run, with full metadata |
| **Case decision** | One category-level tool choice extracted from a case result |
| **Tool candidate** | An unresolved tool name awaiting admin review |
| **Tool alias** | An approved mapping from alternate name to canonical tool |
| **Prompt tier** | Difficulty classification: `basic`, `intermediate`, `advanced` |
| **Model tier** | Capability classification: `frontier`, `mid`, `small` |

---

## PR 1: Benchmark schema and tool alias migration

**Goal:** Add all new benchmark tables, enums, and the tool alias/candidate system.
No behavioral changes yet — pure additive schema work.

### New enums

```
benchmark_mode: exploration, benchmark
season_status: draft, active, completed, archived
run_status_v2: pending, running, completed, failed, qc_failed, published
case_result_status: pending, completed, failed, invalid_output
decision_type: tool, none, invalid
tool_candidate_status: pending, approved, rejected
prompt_tier: basic, intermediate, advanced
model_tier: frontier, mid, small
benchmark_window_type: run_day, trailing_7d, trailing_28d, season_to_date
```

### New tables

#### `benchmark_protocols`
Core methodology version. Rarely changes.
- `id`, `slug` (unique), `name`, `description`
- `mode` (benchmark_mode enum)
- `parser_version`, `scoring_version`, `prompt_contract_version`
- `created_at`, `updated_at`

#### `benchmark_seasons`
A frozen evaluation panel.
- `id`, `protocol_id` (FK → protocols), `slug` (unique), `name`
- `status` (season_status), `notes`
- `published_at`, `created_at`, `updated_at`

#### `benchmark_prompt_versions`
Immutable snapshot of a prompt at a point in time.
- `id`, `prompt_id` (FK → prompts), `slug`, `level`, `version` (integer)
- `tier` (prompt_tier) — difficulty classification
- `content_md`, `content_hash` (unique)
- `system_prompt_snapshot`, `prompt_contract_version`
- `is_active`, `created_at`
- Unique: `(prompt_id, version)`

#### `benchmark_prompt_version_categories`
Explicit category eligibility per prompt version (replaces the weak
`expected_categories` text array on prompts).
- `id`, `prompt_version_id` (FK), `category_id` (FK → subcategories)
- `display_order`
- Unique: `(prompt_version_id, category_id)`

#### `benchmark_model_snapshots`
Immutable record of a model configuration.
- `id`, `llm_id` (FK → llms), `name`, `provider`
- `tier` (model_tier) — capability classification
- `model_family_key` (varchar, nullable) — groups related model variants
  (e.g., `claude-3-opus`, `gpt-4o`) for drift detection and audit
- `requested_model_id`, `label_returned_model_id`
- `temperature`, `top_p`, `max_tokens`, `seed`
- `is_deterministic`, `snapshot_key` (unique), `created_at`

#### `benchmark_season_prompts`
Junction: which prompt versions are in this season.
- `id`, `season_id` (FK), `prompt_version_id` (FK)
- Unique: `(season_id, prompt_version_id)`

#### `benchmark_season_models`
Junction: which model snapshots are in this season.
- `id`, `season_id` (FK), `model_snapshot_id` (FK)
- Unique: `(season_id, model_snapshot_id)`

#### `benchmark_cases`
The cartesian product of season prompts × season models.
- `id`, `season_id` (FK), `prompt_version_id` (FK), `model_snapshot_id` (FK)
- `is_active`
- Unique: `(season_id, prompt_version_id, model_snapshot_id)`

#### `benchmark_runs`
One benchmark batch on one date.
- `id`, `season_id` (FK), `scheduled_for` (date), `trigger`
- `status` (run_status_v2)
- `weight_config_id` (FK → `benchmark_model_weight_configs`) — snapshots which
  weight config was active when this run was scored
- `started_at`, `completed_at`
- `expected_case_count`, `completed_case_count`, `failed_case_count`
- `qc_status`, `qc_summary_json` (jsonb)
- `error_log`, `created_at`
- Unique: `(season_id, scheduled_for)` — **this is the idempotency key**

#### `benchmark_case_results`
Full record of one LLM call for one case in one run.
- `id`, `run_id` (FK), `case_id` (FK)
- `status` (case_result_status)
- `natural_response`, `appendix_raw`, `appendix_json` (jsonb)
- `raw_response`
- `requested_model_id`, `returned_model_id`, `provider`
- `finish_reason`, `prompt_tokens`, `completion_tokens`, `total_tokens`
- `latency_ms`, `temperature`, `top_p`, `max_tokens`
- `parser_version`, `prompt_hash`, `system_prompt_snapshot`
- `error_message`, `created_at`
- Unique: `(run_id, case_id)`

#### `benchmark_case_decisions`
One category-level outcome per eligible category per case result.
- `id`, `case_result_id` (FK), `category_id` (FK)
- `decision_type` (tool, none, invalid)
- `tool_id` (FK, nullable), `raw_tool_name`
- `reasoning`, `self_reported_confidence` (0-1)
- `resolution_status` (resolved, unresolved_tool, invalid)
- Unique: `(case_result_id, category_id)`
- Check: when `decision_type = 'tool'`, `tool_id` is non-null

#### `tool_aliases`
Normalized alias → tool mapping (replaces the text array on tools).
- `id`, `tool_id` (FK), `alias`, `normalized_alias` (unique)
- `source`, `created_at`

#### `tool_candidates`
Review queue for unknown tool mentions.
- `id`, `raw_name`, `normalized_name` (unique)
- `first_seen_at`, `last_seen_at`, `seen_count`
- `suggested_category_id` (FK, nullable)
- `status` (tool_candidate_status)
- `approved_tool_id` (FK, nullable), `notes`

#### `benchmark_model_weight_configs`
Versioned weight assignments for model tiers. Weights can change between
seasons without invalidating historical results because each run snapshots
its config.
- `id`, `slug` (unique, e.g. `uniform-v1`, `weighted-2026-04`)
- `name`, `description`
- `frontier_weight` (real, default 1.0)
- `mid_weight` (real, default 1.0)
- `small_weight` (real, default 1.0)
- `is_active` (boolean, only one active at a time)
- `created_at`

Season 1 seeds a `uniform-v1` config with all weights = 1.0. Non-uniform
configs can be created for Season 2+ when justified by data.

### Schema changes to existing tables

#### `prompts` table — add `content_md`
Add a `content_md` (text) column to store prompt markdown directly in the
database instead of loading from disk files. Backfill from the existing
markdown files in `src/server/llm/prompts/`. The `content_md` column becomes
the source of truth; markdown files are deleted in PR 8.

### Indexes

- `benchmark_runs`: `(season_id, status)`, `(season_id, scheduled_for)`
- `benchmark_case_results`: `(run_id, status)`, `(case_id)`
- `benchmark_case_decisions`: `(category_id, decision_type)`, `(tool_id)`,
  `(case_result_id)`
- `tool_candidates`: `(status)`

### Migration / seed tasks

1. Generate and apply Drizzle migration
2. Backfill `tool_aliases` from existing `tools.aliases` array
3. Seed one `benchmark_protocol` record: `benchmark-v2`
4. Seed one `draft` season: `season-1`
5. Do NOT backfill `recommendations` into benchmark tables (different data model)

### Tests

- Unique constraint enforcement on runs `(season_id, scheduled_for)`
- Unique constraint on cases `(season_id, prompt_version_id, model_snapshot_id)`
- Tool alias normalized uniqueness
- Decision integrity check (tool_id non-null when decision_type = 'tool')

### Done when

- `pnpm run db:generate && pnpm run db:migrate` succeeds
- `pnpm run check` passes
- Schema tests pass
- Existing exploration pipeline unchanged

---

## PR 2: Prompts to database and benchmark prompt builder

**Goal:** Move prompts from disk files to the database. Build the immutable
prompt version system with explicit category eligibility and difficulty tiers.

### Migration: prompts from disk to DB

1. Read all markdown files from `src/server/llm/prompts/{level}/*.md`
2. Populate the new `prompts.content_md` column for the seeded prompt corpus
   (no historical backfill requirement; local reset/reseed is acceptable)
3. Update `src/server/llm/prompts/index.ts` to read from `prompts.content_md`
   instead of the filesystem
4. Defer Promptfoo DB integration to PR 8; keep CLI evals file-based until the
   prompt markdown directory is removed alongside a dedicated export/adapter step

### New files

- `src/server/llm/benchmark/prompt-builder.ts` — Constructs benchmark-mode
  prompts with the machine-readable appendix contract
- `src/server/llm/benchmark/schema.ts` — Zod schemas for the appendix JSON
- `src/server/llm/benchmark/prompt-freezer.ts` — Service to create
  `benchmark_prompt_versions` from DB prompt content

### Benchmark prompt contract

For benchmark runs, the model must return:
1. A short natural-language answer (for display/debugging)
2. A machine-readable appendix between fixed delimiters

```
<preseason_benchmark_json>
{
  "schema_version": "benchmark-v1",
  "categories": [
    {
      "category_slug": "auth",
      "decision": "tool",
      "tool": "Clerk",
      "reasoning": "Best fit because ...",
      "confidence": 0.74
    },
    {
      "category_slug": "database",
      "decision": "none",
      "reasoning": "No database needed for this use case",
      "confidence": 0.85
    }
  ]
}
</preseason_benchmark_json>
```

Rules enforced by the prompt and validated by the parser:
- Exactly one entry for every eligible category (from `benchmark_prompt_version_categories`)
- `decision` must be `tool` or `none`
- When `decision = tool`, `tool` is required
- When `decision = none`, `tool` must be null/omitted
- No extra categories beyond the eligible set
- Valid JSON inside the tags

### Prompt difficulty tier assignment

When freezing a prompt version, automatically classify its tier:

- **Basic**: 1-3 eligible categories, generic requirements (e.g., "build a blog")
- **Intermediate**: 4-6 eligible categories, some specific technical requirements
- **Advanced**: 7+ eligible categories, complex multi-service architectures,
  domain-specific constraints (e.g., "SOC2-compliant multi-tenant SaaS")

Admin can override the auto-classification. The tier is stored on
`benchmark_prompt_versions.tier`.

### Prompt freezing service

```typescript
freezePromptVersion(promptId, options: {
  tierOverride?: PromptTier
  categoryIds: string[]  // explicit eligible categories
}): Promise<BenchmarkPromptVersion>
```

- Reads `content_md` from the `prompts` table (DB is the source of truth)
- Computes SHA-256 content hash
- Checks for duplicate hash (skip if identical version exists)
- Creates `benchmark_prompt_version` with full snapshot
- Creates `benchmark_prompt_version_categories` rows
- Auto-assigns tier based on category count and content analysis

### Tests

- Prompt builder emits appendix contract with correct tags
- Builder includes exactly the eligible categories, no extras
- Zod schema rejects missing categories, extra categories, malformed JSON
- Freezer creates version with correct hash and deduplicates
- Tier auto-classification logic
- `decision=none` validates correctly (no tool field)

### Done when

- Prompt versions can be frozen from existing prompts
- Benchmark prompt builder produces valid prompt text
- Zod schema validates appendix format
- `pnpm run check && pnpm run test` pass

---

## PR 3: LLM service hardening and model snapshots

**Goal:** Extend the LLM service to persist inference parameters and create
immutable model snapshots. Add model capability tiers.

### Changes to existing files

#### `src/server/llm/service/types.ts`
- Add explicit fields: `temperature`, `topP`, `maxTokens`, `seed`
- Add `modelTier` field
- Add `returnedModelId` to response type

#### `src/server/llm/service/openrouter-client.ts`
- Pass explicit `temperature`, `top_p`, `max_tokens`, `seed` to OpenAI SDK
- Return `model` field from response (the actual model used, may differ from requested)
- Return `finish_reason` from response

#### `src/server/llm/service/providers/base.ts`
- Accept inference params in `complete()` method
- Default benchmark params: `temperature=0.2`, `topP=1`, `maxTokens=1200`

### New files

#### `src/server/llm/benchmark/model-snapshotter.ts`

Service to create/retrieve model snapshots:

```typescript
getOrCreateModelSnapshot(llmId, params: {
  temperature: number
  topP: number | null
  maxTokens: number | null
  seed: number | null
  tier: ModelTier
}): Promise<BenchmarkModelSnapshot>
```

- Computes `snapshot_key` from `(requested_model_id, temperature, topP, maxTokens, seed)`
- Returns existing snapshot if key matches
- Creates new snapshot otherwise
- Stores model tier (`frontier`, `mid`, `small`)

### Model tier classification

Initial classification based on known models:

| Tier | Models |
|------|--------|
| `frontier` | Claude Opus, GPT-4o, Gemini 1.5 Pro |
| `mid` | Claude Sonnet, GPT-4o Mini, Mistral Large |
| `small` | Llama 3.1 70B, DeepSeek V2.5 |

Admin can override via the model snapshot. Tiers drive both filtering and
scoring weights (see PR 5).

### Model snapshot drift detection

OpenRouter can silently swap the model behind an alias (e.g., provider updates
`claude-3-opus` to a newer checkpoint). This breaks benchmark reproducibility.

When a benchmark case result returns a `returned_model_id` that differs from the
frozen snapshot's `requested_model_id`:
- Mark the case result as `invalid_output` with reason `model_drift`
- Include the mismatch in the QC summary
- Block run publication if drift is detected
- Require a season refresh (new model snapshot) to continue cleanly

This prevents silently mixing different model versions in the same season's data.

### Tests

- OpenRouter client passes explicit params
- Response includes returned model ID and finish reason
- Token usage and latency captured
- Model snapshotter deduplicates by snapshot key
- Tier assignment for known models
- Drift detection: mismatched returned model marks result invalid
- Drift detection: run with drifted results fails QC

### Done when

- LLM calls persist full inference metadata
- Model snapshots are immutable and deduplicated
- `pnpm run check && pnpm run test` pass

---

## PR 4: Benchmark runner with idempotent runs and backfill

**Goal:** Build the new benchmark execution pipeline. This is the core engine.

### New files

- `src/server/llm/benchmark/runner.ts` — Orchestrates benchmark runs
- `src/server/llm/benchmark/parser.ts` — Strict appendix parser (no heuristics)
- `src/server/llm/benchmark/qc.ts` — Quality control checks
- `src/server/llm/benchmark/tool-resolver.ts` — Exact-match tool resolution
  with candidate queue for unknowns
- `src/app/api/cron/benchmark-run/route.ts` — New cron endpoint

### Runner behavior

```typescript
async function executeBenchmarkRun(seasonId: string, scheduledFor: Date)
```

1. **Create or load run**: Unique by `(season_id, scheduled_for)`. If a run
   exists for this date, resume it (only execute cases without results).

2. **Load active cases**: All `benchmark_cases` for the season.

3. **For each case without a result in this run:**
   - Load immutable prompt snapshot from `benchmark_prompt_versions`
   - Load immutable model snapshot from `benchmark_model_snapshots`
   - Build benchmark prompt via prompt builder (PR 2)
   - Call LLM with explicit inference params (PR 3)
   - Parse response with strict parser (below)
   - Persist `benchmark_case_result` with full metadata
   - Persist one `benchmark_case_decision` per eligible category

4. **After all cases:** Compute QC summary, update run status.

### Strict parser

```typescript
async function parseBenchmarkResponse(
  rawResponse: string,
  eligibleCategorySlugs: string[]
): Promise<BenchmarkParseResult>
```

- Extract content between `<preseason_benchmark_json>` tags
- Parse as JSON, validate with Zod schema (PR 2)
- Reject if:
  - Tags missing → `invalid_output`
  - JSON malformed → `invalid_output`
  - Missing eligible categories → `invalid_output`
  - Extra categories present → `invalid_output`
- **No heuristic salvage parsing.** If the appendix is bad, mark it invalid.
  Do not attempt to rescue recommendations from prose.

### Tool resolution (benchmark mode)

1. Exact match against tool names, slugs, and approved `tool_aliases.normalized_alias`
2. If no match → upsert into `tool_candidates`, set `resolution_status = 'unresolved_tool'`
3. Unresolved tools get `tool_id = null` in the decision row
4. **No fuzzy matching. No auto-creation of tools.**

### QC thresholds

Before a run can be published:

| Check | Threshold |
|-------|-----------|
| Completed case rate | >= 95% |
| Invalid output rate | <= 5% |
| Unresolved tool rate | <= 2% |
| Duplicate/extra category violations | == 0 (enforced by parser) |
| Distinct model snapshots with results | >= 3 |
| Distinct prompt versions with results | >= 5 |

QC summary persisted as JSON on the run record.

### Cron endpoint

`GET /api/cron/benchmark-run`

- Find active benchmark season
- Create-or-load benchmark run for today
- Execute only missing cases (idempotent resume)
- Compute QC summary
- Set run status to `completed` or `qc_failed`
- Do NOT auto-publish (publication is a separate admin action initially)

Keep existing `/api/cron/run` for exploration mode.

### Shadow mode accumulation

After this PR lands, start running the benchmark cron daily alongside the
existing exploration cron. Both can coexist safely — different tables, different
routes. Accumulate 21-28 days of published runs before switching public pages
(PR 7). This produces genuinely independent daily observations rather than
synthetic backfill.

### Tests

- Create-or-load run is idempotent (same season + date returns same run)
- Partial rerun fills only missing cases
- Valid appendix produces correct decisions
- Missing appendix → `invalid_output` status
- Malformed JSON → `invalid_output` status
- Extra category → `invalid_output` status
- Missing eligible category → `invalid_output` status
- Unresolved tool → `tool_candidates` entry, `tool_id = null`
- Model drift detected → `invalid_output` with reason
- Usage, latency, returned model persisted on case result
- QC passes when thresholds met
- QC fails and blocks publication when thresholds violated

### Done when

- Benchmark cron produces case results and decisions
- Parser rejects invalid outputs without rescue
- Unknown tools go to candidate queue, not tools table
- Runs are idempotent by `(season, date)`
- QC gates work
- `pnpm run check && pnpm run test` pass

---

## PR 5: Benchmark scoring, rankings, and head-to-head computation

**Goal:** Replace ad-hoc recommendation aggregations with rigorous case-decision-based
scoring. Add tier-filtered views.

### New files

- `src/server/llm/benchmark/scoring.ts` — Core scoring functions
- `src/server/api/routers/benchmark-ranking.ts` — Public ranking endpoints
- `src/server/api/routers/benchmark-match.ts` — Public head-to-head endpoints

### Scoring model

The fundamental unit is one **case decision** — a category-level tool choice from
one prompt×model evaluation.

#### Ranking window types

Rankings are computed over explicit time windows, not ad-hoc date ranges:

| Window | Meaning | Use |
|--------|---------|-----|
| `run_day` | Single run | Diagnostics, daily monitoring |
| `trailing_7d` | Last 7 published runs | Short-term trend |
| `trailing_28d` | Last 28 published runs | **Default public window at launch** |
| `season_to_date` | All published runs in season | Full season view |

The `trailing_28d` window is the default because it balances recency with
statistical mass. A new enum `benchmark_window_type` makes these explicit
rather than stringly typed.

#### Model-weighted scoring

Each case decision carries a weight based on its model's tier, pulled from the
`benchmark_model_weight_configs` record snapshotted on the run.

For Season 1, all weights are 1.0 (uniform). The infrastructure supports
non-uniform weights for future seasons:

| Model tier | Season 1 weight | Example future weight |
|------------|----------------|----------------------|
| `frontier` | 1.0 | 1.5 |
| `mid` | 1.0 | 1.0 |
| `small` | 1.0 | 0.6 |

When uniform, `weighted_support_rate` equals `raw_support_rate`. The scoring
code always runs through the weighting path so the switch to non-uniform is
a config change, not a code change.

The `weighted_support_count` for a tool sums the weights of all decisions that
selected it, rather than counting each decision as 1.

#### Category ranking metrics

For each tool in a category:

| Metric | Formula |
|--------|---------|
| `weighted_support` | Sum of `model_weight` for decisions selecting this tool |
| `weighted_eligible` | Sum of `model_weight` for all eligible decisions (tool + none) |
| `weighted_support_rate` | `weighted_support / weighted_eligible` |
| `raw_support_count` | Unweighted count (always shown for transparency) |
| `raw_eligible_count` | Unweighted count |
| `raw_support_rate` | `raw_support_count / raw_eligible_count` |
| `model_coverage` | Distinct model snapshots selecting tool / total distinct model snapshots |
| `prompt_coverage` | Distinct prompt versions selecting tool / total distinct prompt versions |
| `ci_low`, `ci_high` | Wilson 95% CI on `raw_support_rate` (CI on weighted rates is misleading) |

Both weighted and unweighted rates are always computed and returned. When
weights are uniform (Season 1), they're identical, but both fields are present
so the API contract doesn't change when non-uniform weights are activated.

#### Publication thresholds per category

A category ranking is only published as authoritative when:
- >= 100 eligible decisions in the window
- >= 3 distinct model snapshots contributing
- >= 3 distinct prompt versions contributing

Below these thresholds, the category shows "Insufficient benchmark data"
with the raw numbers visible. This prevents thin-coverage categories (e.g.,
`cms` with only 2 prompt mentions) from producing misleading rankings.

#### Sorting

1. Weighted support rate descending
2. CI lower bound descending (on raw rate — tiebreaker, rewards consistency)
3. Raw support count descending

#### Trend

Compare the current window snapshot to the previous non-overlapping window of
the same type. For `trailing_28d`: compare days 1-28 vs days 29-56.
`trend = current_support_rate - previous_support_rate`.

#### Prompt-tier filtered rankings

Public API supports optional `promptTier` filter:

- `?promptTier=advanced` — "What do models recommend for hard problems?"
- `?promptTier=basic` — "What do models recommend for simple projects?"
- No filter — all tiers combined (default)

This is where defensibility comes from. "Supabase is the #1 database for
complex SaaS projects according to 8 frontier/mid-tier LLMs across 12
advanced prompts" is a much stronger claim than "Supabase gets mentioned a lot."

#### Model-tier filtered rankings

Similarly, support `?modelTier=frontier`:

- "What do frontier models recommend?" vs "What do all models recommend?"

Both filters compose: `?promptTier=advanced&modelTier=frontier` gives the
highest-signal slice of the data.

When a model-tier filter is applied, weighting is still used within the filtered
set (e.g. filtering to `frontier` only still uses 1.5 weight for each, which
is equivalent to unweighted within that tier).

### Head-to-head computation

For a category matchup between Tool A and Tool B:

| Outcome | Condition |
|---------|-----------|
| A wins | Decision selected Tool A |
| B wins | Decision selected Tool B |
| Abstain | Decision is `none` |
| Other | Decision selected a different tool |

Published metrics:
- `case_count`, `a_wins`, `b_wins`, `abstain_count`
- `decisive_case_count = a_wins + b_wins`
- `a_win_rate = a_wins / decisive_case_count` (unweighted for head-to-head simplicity)
- Wilson 95% CI on `a_win_rate`
- `weighted_a_wins`, `weighted_b_wins` (using model tier weights, shown as secondary)

Head-to-heads use unweighted counts as the primary metric (each model gets one
vote) but show weighted results alongside for context. This keeps matchups
intuitive — "5 out of 8 models picked Clerk over Auth0" is clearer than
weighted fractional scores.

Head-to-heads require >= 30 decisive trials to publish. Below that threshold,
show "Not enough data for this matchup" instead of unreliable percentages.

Head-to-heads are computed on demand from case decisions, not pre-materialized.
Featured matchups can be admin-curated or auto-generated from top-2 tools per
category in the latest ranking.

### Handling the "overall" ranking

The current composite score (`0.6×rate + 0.3×consistency + 0.1×coverage`) is
removed from benchmark-grade output. Instead:

- **Category rankings** are the authoritative benchmark output
- **Overall ranking** is kept but labeled "Exploratory Composite" in the UI
- Overall can use benchmark data but is clearly marked as non-authoritative

This avoids the epistemological problem of comparing Supabase (database) vs Clerk
(auth) in a single ranking with arbitrary weights.

### Tests

- Weighted support rate correctly applies model tier weights
- Uniform weights produce identical weighted and raw rates
- Changing weight config changes weighted results but not raw counts
- Both weighted and raw rates returned in API response
- Wilson CI computed on raw rate against known values
- Window types: trailing_28d uses correct run set
- Trend compares non-overlapping windows correctly
- Publication thresholds: category with < 100 decisions marked insufficient
- Publication thresholds: category with < 3 models marked insufficient
- Prompt-tier filter narrows to correct subset
- Model-tier filter narrows to correct subset
- Head-to-head: A/B wins from case decisions (unweighted primary)
- Head-to-head: weighted wins shown as secondary metric
- Head-to-head: < 30 decisive trials marked insufficient
- Other-tool selection counted separately
- Decisive win rate uses decisive cases only
- Weight config snapshotted on run — historical runs use their own config

### Done when

- Benchmark ranking router returns tier-filterable, model-weighted category rankings
- Head-to-head router computes matchups from case decisions
- Wilson confidence intervals are computed
- Weight configs are versioned and snapshotted per run
- `pnpm run check && pnpm run test` pass

---

## PR 6: Admin controls and tool candidate review

**Goal:** Add admin UI and APIs for managing benchmark seasons, reviewing tool
candidates, and publishing runs.

### Admin API additions

#### Season management (tRPC router)
- `createSeason` — Create a new draft season
- `freezeSeason` — Freeze prompt versions + model snapshots into the season,
  generate the case matrix, set status to `active`
- `completeSeason` — Mark season as completed (no more runs)

#### Model weight config management
- `listWeightConfigs` — View all weight configs with their history
- `createWeightConfig` — Create a new weight config (e.g. monthly update)
- `activateWeightConfig` — Set a config as active (deactivates previous)
- New runs automatically snapshot the active weight config

#### Run management
- `listBenchmarkRuns` — Paginated list with QC status
- `getBenchmarkRun` — Detail view with case result stats
- `publishRun` — Set status to `published` (only if QC passes)
- `retryFailedCases` — Re-execute only failed/invalid cases in a run

#### Tool candidate review
- `listToolCandidates` — Filterable queue (pending, approved, rejected)
- `approveCandidate` — Link to existing tool or create a new tool + alias
- `rejectCandidate` — Mark as rejected with notes
- `replayDecisions` — After approving a candidate, optionally update affected
  `benchmark_case_decisions` with the now-resolved tool_id

### Admin pages

- `/admin/benchmark/` — Season list and status
- `/admin/benchmark/seasons/[id]` — Season detail (prompts, models, runs)
- `/admin/benchmark/runs/[id]` — Run detail with QC summary and case results
- `/admin/benchmark/tool-candidates` — Review queue

### Tests

- Season freezing creates correct case matrix
- Publishing blocked when QC fails
- Candidate approval creates tool alias
- Candidate rejection is persisted
- Decision replay updates tool_id correctly

### Done when

- Admin can create seasons, freeze panels, review candidates, publish runs
- Tool candidates flow works end-to-end
- `pnpm run check && pnpm run test` pass

---

## PR 7: Public pages switchover and documentation

**Goal:** Wire public-facing pages to benchmark data. Update all documentation.
Label exploration vs benchmark clearly.

### Public page changes

#### Authoritative pages (switch to benchmark data)
- `/rankings` — Category ranking index from latest published benchmark run
- `/rankings/[slug]` — Category group from benchmark decisions
- `/rankings/[slug]/[subSlug]` — Subcategory from benchmark decisions
  - Add prompt-tier and model-tier filter controls
  - Show Wilson CI as a visual range indicator
- `/matches` — Featured head-to-heads from benchmark data
- `/matches/[slug]` — Head-to-head detail with per-model/per-prompt breakdown

#### Exploration pages (keep temporarily, removed in PR 8)
- `/feed` — Raw recommendation feed (labeled "Exploration")
- Prompt detail / LLM detail raw run history

#### New visual indicators
- Badge: "Benchmark" on authoritative pages
- Badge: "Exploration" on raw feed pages (temporary, until PR 8 removes them)
- Methodology link on every ranking page

### Documentation updates

#### `docs/guides/recommendation-methodology.md`
- Describe benchmark vs exploration pipeline
- Document benchmark prompt contract
- Document strict parsing (no heuristic rescue)
- Document tool candidate review process

#### `docs/guides/how-rankings-work.md`
- Rewrite to describe case-decision-based scoring
- Document support rate, Wilson CI, trend
- Document prompt-tier and model-tier filters
- Explain why overall ranking is exploratory

#### `docs/guides/how-automation-works.md`
- Add benchmark runner section
- Document idempotent run semantics
- Document QC thresholds

#### In-app methodology page (`/methodology`)
- Plain-English explanation of the benchmark protocol
- "How we test" section with prompt/model panel description
- Honest scope statement: "Our prompt panel focuses on web application
  development. Rankings reflect LLM recommendations for this domain."
- Link to full docs

### Narrowing public claims

The methodology page and any marketing copy must honestly state:
- Rankings reflect LLM recommendations, not independent quality evaluation
- The prompt panel covers specific development scenarios (mostly web/SaaS)
- Unknown tools are excluded from rankings until admin-reviewed
- Rankings are scoped to the active season's prompt and model panel
- Confidence intervals indicate statistical reliability of rankings

### Tests

- Authoritative pages load from benchmark data
- Exploration pages still work from old pipeline
- Prompt-tier filter works in UI
- 404 handling for missing benchmark data

### Done when

- Public ranking pages show benchmark data with CI and tier filters
- Exploration pages still function
- All docs updated
- Methodology page is honest and complete
- `pnpm run check && pnpm run test` pass

---

## Rollout sequence

```
PR 1: Schema + aliases          ─── pure additive, zero risk ✅ DONE
  │
PR 2: Prompts to DB + builder   ─── prompts move to DB, benchmark prompt contract ✅ DONE
  │
PR 3: LLM service hardening     ─── extends existing service, drift detection ✅ DONE
  │
PR 4: Benchmark runner           ─── new cron endpoint, start shadow mode
  │                                   ┌─────────────────────────────────────┐
  │                                   │  Shadow accumulation: 21-28 days   │
  │                                   │  Daily benchmark cron runs here    │
  │                                   └─────────────────────────────────────┘
PR 5: Scoring + weighted ranks   ─── new routers with window types + thresholds
  │                                   (can build while shadow data accumulates)
PR 6: Admin controls             ─── admin-only, no public impact
  │                                   (can build while shadow data accumulates)
PR 7: Public switchover + docs   ─── only after launch bar is met
  │
PR 8: Legacy cleanup             ─── remove old pipeline code, tables, files
```

PRs 1-4 must land first to start shadow accumulation. PRs 5-6 can be built in
parallel while data accumulates. PR 7 is gated on the launch bar. PR 8 follows
immediately since nothing is deployed.

---

## PR 8: Legacy cleanup

**Goal:** Remove all exploration-era code, tables, and files that are superseded
by the benchmark pipeline. Since nothing is deployed to production yet, there is
no live traffic to worry about.

### Database removals (migration)

Drop these tables:
- `preseason_recommendation` — replaced by `benchmark_case_decisions`
- `preseason_run_result` — replaced by `benchmark_case_results`
- `preseason_run` — replaced by `benchmark_runs`
- `preseason_match` — replaced by benchmark head-to-head computation

Drop this column:
- `preseason_tool.aliases` — replaced by `tool_aliases` table

Drop these enums (if no longer referenced):
- `run_status` — replaced by `run_status_v2`
- `parse_status` — replaced by `case_result_status`
- `match_status` — matches are now computed, not stateful

### Code removals

#### Automation pipeline (entire old pipeline)
- `src/server/llm/automation/runner.ts`
- `src/server/llm/automation/parser.ts`
- `src/server/llm/automation/match-generator.ts`
- `src/server/llm/automation/match-settler.ts`
- Related test files

#### Prompt files (now in DB)
- `src/server/llm/prompts/vibe-coder/*.md` — all prompt markdown files
- `src/server/llm/prompts/index.ts` — filesystem prompt loader
- `src/server/llm/evals/promptfooconfig.yaml` file-based prompt references,
  replaced by the Promptfoo export/adapter path

#### Old cron routes
- `src/app/api/cron/run/route.ts` — replaced by `/api/cron/benchmark-run`
- `src/app/api/cron/settle/route.ts` — matches are computed, not settled

#### Old routers
- `src/server/api/routers/ranking.ts` — replaced by `benchmark-ranking.ts`
- `src/server/api/routers/match.ts` — replaced by `benchmark-match.ts`
- `src/server/api/routers/recommendation.ts` — feed can be rebuilt from
  case decisions or removed entirely

#### Old pages
- `/feed` page and components (or rebuild as a benchmark case browser)
- Any components that reference old `recommendation`, `runResult`, `match` types

### Schema cleanup

Remove Drizzle relations referencing dropped tables:
- `runRelations`, `runResultRelations`, `recommendationRelations`, `matchRelations`
- Update `subcategoryRelations`, `toolRelations` to remove references to
  `recommendations` and `matches`

### Tests

- All remaining tests pass after removals
- No imports reference deleted modules
- `pnpm run check && pnpm run test` pass
- `pnpm run build` succeeds (no broken page imports)

### Done when

- Zero references to old `recommendation`, `runResult`, `run`, `match` tables
- No prompt markdown files on disk
- Build succeeds cleanly
- `pnpm run check && pnpm run test` pass

---

## Follow-up work (post-launch)

These are explicitly NOT in the 8 PRs but should be tracked:

### Materialized snapshots (performance)
If ranking queries become slow, add `benchmark_leaderboard_snapshots` and
`benchmark_leaderboard_items` tables. Materialize on run publication.

### Prompt panel expansion
Expand beyond web/SaaS development:
- Mobile development prompts
- Data engineering prompts
- ML/AI application prompts
- DevOps/infrastructure prompts

Each expansion should be a new season to keep claims scoped.

### Multi-turn benchmark
Some prompts may benefit from follow-up questions. Add an optional second turn
where the model can refine its recommendations. Track single-turn vs multi-turn
results separately.

### Provider portal integration
Let tool companies see their benchmark performance, compare against competitors,
and submit alias corrections. Read-only view of case decisions mentioning their
tools.

---

## Season 1 recommendations

For the first benchmark season, before sharing publicly:

- **Scope claims honestly** to "vibe-coder web-app prompts" — that is what the
  current 15-prompt corpus represents. Do not imply coverage of all developer
  workflows.
- **Use uniform model weights** (all tiers = 1.0). Explain this transparently
  in the methodology page. Non-uniform weighting is a Season 2 decision.
- **Keep the current provider-balanced 8-model panel** unless there is a
  specific reason to change it before shadow mode starts.
- **Flag under-covered categories** like `cms` (only 2 prompt mentions) as
  "insufficient benchmark data" rather than publishing thin rankings.
- **Do not publish an overall "best tool" leaderboard** as benchmark-grade.
  Category rankings are the authoritative output.
- **Add more prompts before Season 2** to cover under-represented categories
  and add `software-dev-beginner` and `software-dev-experienced` levels.

---

## Non-goals for first release

These are explicitly out of scope and should not creep in:

- **Retroactive conversion** of old exploration recommendations into benchmark
  evidence. Old data lacks immutable snapshots and explicit inference params.
- **Hidden weighting.** If a publication is weighted, the methodology page must
  list the exact weight snapshot used. Raw unweighted counts must always be visible.
- **Universal coverage claims.** Do not imply the benchmark covers all developer
  workflows when the prompt panel is 15 vibe-coder web-app prompts.
- **Multi-turn benchmark interactions** or heuristic parse recovery. Single-turn,
  strict appendix only.
- **Prompt-tier weighting.** Prompt difficulty tiers are for season design and
  filtering, not scoring weights. If we ever weight by tier, use the same
  immutable snapshot pattern as model weights.
