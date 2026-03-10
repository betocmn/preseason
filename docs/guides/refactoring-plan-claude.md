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

This plan rebuilds the methodology as a proper benchmark protocol while keeping the
existing exploration pipeline intact during migration.

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

### 3. Seven PRs, not eleven phases

The initial proposal has 11 phases, several of which are small enough to combine
and some large enough to split. This plan targets 7 PRs that each deliver a
testable, deployable increment. Each PR has a clear "done when" gate.

### 4. Backfill strategy for launch data

To launch with weeks of historical data, we need to retroactively run the
benchmark protocol against the existing prompt corpus. Phase 4 includes a
backfill command that replays the benchmark runner against historical dates,
producing case results as if the benchmark had been running all along.

### 5. Keep the "overall" ranking but label it clearly

The initial proposal removes the overall ranking entirely. Instead, this plan
keeps it but:
- Labels it "Exploratory" or "Composite" in the UI
- Removes it from any "benchmark-grade" claims
- Category-level rankings are the authoritative benchmark output

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
- `source_path`, `content_md`, `content_hash` (unique)
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

## PR 2: Benchmark prompt builder and version freezing

**Goal:** Build the immutable prompt system. Prompts get frozen as versioned
snapshots with explicit category eligibility and difficulty tiers.

### New files

- `src/server/llm/benchmark/prompt-builder.ts` — Constructs benchmark-mode
  prompts with the machine-readable appendix contract
- `src/server/llm/benchmark/schema.ts` — Zod schemas for the appendix JSON
- `src/server/llm/benchmark/prompt-freezer.ts` — Service to create
  `benchmark_prompt_versions` from existing prompts

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

- Reads current prompt markdown from disk
- Computes SHA-256 content hash
- Checks for duplicate hash (skip if identical version exists)
- Creates `benchmark_prompt_version` with full snapshot
- Creates `benchmark_prompt_version_categories` rows
- Auto-assigns tier based on category count and content analysis

### Keep existing prompts system for exploration

`src/server/llm/prompts/index.ts` remains untouched for exploration mode.

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

Admin can override via the model snapshot. Tier is informational for filtering —
it does not affect scoring weights in V1 (but enables future weighting).

### Tests

- OpenRouter client passes explicit params
- Response includes returned model ID and finish reason
- Token usage and latency captured
- Model snapshotter deduplicates by snapshot key
- Tier assignment for known models

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

### Backfill command

For launch with historical data, add a utility:

```typescript
async function backfillBenchmarkRuns(
  seasonId: string,
  startDate: Date,
  endDate: Date
)
```

- For each date in range, execute `executeBenchmarkRun(seasonId, date)`
- Idempotent: safe to re-run if interrupted
- Use this to generate weeks of benchmark data before public launch

### Tests

- Create-or-load run is idempotent (same season + date returns same run)
- Partial rerun fills only missing cases
- Valid appendix produces correct decisions
- Missing appendix → `invalid_output` status
- Malformed JSON → `invalid_output` status
- Extra category → `invalid_output` status
- Missing eligible category → `invalid_output` status
- Unresolved tool → `tool_candidates` entry, `tool_id = null`
- Usage, latency, returned model persisted on case result
- QC passes when thresholds met
- QC fails and blocks publication when thresholds violated
- Backfill creates runs for each date in range

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

#### Category ranking metrics

For each tool in a category:

| Metric | Formula |
|--------|---------|
| `support_count` | Decisions where `decision_type = 'tool' AND tool_id = <tool>` |
| `eligible_case_count` | Decisions where `decision_type IN ('tool', 'none')` |
| `support_rate` | `support_count / eligible_case_count` |
| `abstain_rate` | `none_count / eligible_case_count` |
| `model_coverage` | Distinct model snapshots selecting tool / total distinct model snapshots |
| `prompt_coverage` | Distinct prompt versions selecting tool / total distinct prompt versions |
| `ci_low`, `ci_high` | Wilson 95% confidence interval on support_rate |

#### Sorting

1. Support rate descending
2. CI lower bound descending (tiebreaker — rewards consistency)
3. Support count descending

#### Trend

Compare metrics between the latest completed run and the previous completed run
in the same season. `trend = current_support_rate - previous_support_rate`.

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
- `a_win_rate = a_wins / decisive_case_count`
- Wilson 95% CI on `a_win_rate`

Head-to-heads are computed on demand from case decisions, not pre-materialized.
Featured matchups can be admin-curated or auto-generated from top-2 tools per
category in the latest ranking.

### Handling the "overall" ranking

The current composite score (`0.6×rate + 0.3×consistency + 0.1×coverage`) is
removed from benchmark-grade output. Instead:

- **Category rankings** are the authoritative benchmark output
- **Overall ranking** is kept but labeled "Exploratory Composite" in the UI
- Overall uses the old exploration pipeline data, not benchmark data

This avoids the epistemological problem of comparing Supabase (database) vs Clerk
(auth) in a single ranking with arbitrary weights.

### Tests

- Support rate uses eligible-case denominator
- Abstains handled correctly (excluded from support rate denominator: no — they
  are a valid `none` decision and included)
- Wilson CI computed correctly against known values
- Trend compares consecutive completed runs
- Prompt-tier filter narrows to correct subset
- Model-tier filter narrows to correct subset
- Head-to-head: A/B wins from case decisions
- Other-tool selection counted separately
- Decisive win rate uses decisive cases only

### Done when

- Benchmark ranking router returns tier-filterable category rankings
- Head-to-head router computes matchups from case decisions
- Wilson confidence intervals are computed
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

#### Exploration pages (keep using old pipeline)
- `/feed` — Raw recommendation feed (labeled "Exploration")
- Prompt detail / LLM detail raw run history

#### New visual indicators
- Badge: "Benchmark" on authoritative pages
- Badge: "Exploration" on raw feed pages
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
PR 1: Schema + aliases         ─── pure additive, zero risk
  │
PR 2: Prompt builder + freezer ─── new code, no prod changes
  │
PR 3: LLM service hardening    ─── extends existing service, backwards compatible
  │
PR 4: Benchmark runner          ─── new cron endpoint, old cron untouched
  │                                  Run backfill to generate launch data
  │
PR 5: Scoring + rankings API    ─── new routers, old routers untouched
  │
PR 6: Admin controls            ─── admin-only, no public impact
  │
PR 7: Public switchover + docs  ─── the visible change, all infrastructure ready
```

Each PR is independently deployable. PRs 1-4 can run in production generating
benchmark data while the public site still shows exploration data. PR 7 is the
flip — only merged when we're confident in the benchmark data quality.

---

## Follow-up work (post-launch)

These are explicitly NOT in the 7 PRs but should be tracked:

### Materialized snapshots (performance)
If ranking queries become slow, add `benchmark_leaderboard_snapshots` and
`benchmark_leaderboard_items` tables. Materialize on run publication. This is
the deferred denormalization from the initial proposal.

### Model-weighted scoring
Use model tiers as scoring weights rather than just filters. A frontier model's
vote could count 1.5× while a small model counts 0.75×. Requires careful
calibration and transparency about the weighting.

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

### Historical exploration data migration
Optionally backfill historical `recommendation` rows into the benchmark format
for trend analysis. Lower priority since benchmark runs will generate fresh data.

### Delete legacy tables
Once benchmark data has been running for 2+ months and exploration pages are
sunset, clean up:
- Remove `preseason_recommendation` table
- Remove `preseason_run_result` table
- Remove `preseason_run` table (replace with benchmark_runs)
- Remove `tools.aliases` column (replaced by `tool_aliases` table)
- Remove old ranking/match routers
