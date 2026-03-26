# Benchmark Refactoring Plan

## Purpose

Rebuild Preseason's public methodology so authoritative rankings and matches come from a frozen, reproducible benchmark protocol instead of the current exploration pipeline.

This plan is phased, but not permanently additive:

- Keep the current exploration pipeline, tables, and routes working only long enough to migrate safely.
- Build benchmark infrastructure in parallel.
- Switch the authoritative public surfaces to benchmark data after the new protocol has accumulated enough history to support public claims.
- End with a final cleanup PR that removes the legacy exploration stack and file-backed prompt path if we no longer need them.

## Current-state constraints

The current repository is useful for exploration, not for benchmark-grade public claims:

- Prompt text is loaded from markdown files at runtime via `src/server/llm/prompts/index.ts`.
- The automation runner in `src/server/llm/automation/runner.ts` sends a realism-first prompt, then falls back to a second extraction pass when parsing fails.
- The parser in `src/server/llm/automation/parser.ts` can fuzzy-match tools and auto-create unknown tools.
- Public rankings in `src/server/api/routers/ranking.ts` aggregate raw `preseason_recommendation` rows.
- Match generation and settlement in `src/server/llm/automation/match-generator.ts` and `src/server/llm/automation/match-settler.ts` also use raw recommendation counts.
- The cron route in `src/app/api/cron/run/route.ts` creates a fresh run on every invocation.
- LLM request parameters are not frozen or persisted end-to-end in the current service layer.

There are also panel-shape constraints we need to respect:

- The current prompt set is 15 `vibe-coder` prompts only.
- The current seed model panel is 8 models and is already roughly provider-balanced.
- Some categories are under-covered by the current prompt panel. For example, `cms` only appears in 2 prompt metadata entries, which is not enough for a strong public benchmark claim.

## Guiding decisions

### 1. Benchmark and exploration stay separate

Exploration should keep answering "what are models doing in the wild right now?" Benchmark should answer "within this frozen season, what do models select under a reproducible protocol?"

### 2. Prompt source of truth moves to the database

Prompt markdown files are fine for bootstrapping, but they should not remain the source of truth.

The plan should be:

- store editable prompt content in the database
- freeze benchmark prompt versions from the database, not from disk
- either export prompt files for Promptfoo or teach Promptfoo to read from the database

This keeps prompt editing, prompt versioning, and benchmark reproducibility in one place.

### 3. The season is the unit of public claim

Public claims must be scoped to a frozen prompt panel and frozen model panel. We should say "within Benchmark Season 1" rather than implying universal truth across all developer workflows.

### 4. We cannot defensibly backfill legacy exploration data into benchmark tables

Old `preseason_recommendation` rows do not carry immutable prompt snapshots, frozen model snapshots, or explicit inference params. They can remain valuable as exploration history, but they should not become authoritative benchmark evidence.

### 5. To launch with weeks of benchmark data, run the new protocol in shadow first

The correct path is:

1. Land the benchmark pipeline behind admin and internal routes.
2. Run it daily in parallel with exploration.
3. Accumulate at least several weeks of benchmark snapshots.
4. Cut public authoritative pages over only after the benchmark history is real.

### 6. Model weighting should be supported now, but only through immutable weight snapshots

Model weighting belongs in the design, but it must be explicit and reproducible.

The benchmark should support:

- a default uniform weight snapshot
- future non-uniform model weight snapshots when we decide they are needed
- published benchmark snapshots that point to the exact weight snapshot used
- visible methodology text that explains whether a public ranking is weighted or uniform
- raw unweighted counts remaining visible even when weighted rates are used

Given the current seed panel is already close to provider-balanced, season composition is still the first control. Weighting is a supported mechanism, not an excuse to ignore panel quality.

### 7. Prompt difficulty tiers should exist, but as a panel-design and audit tool first

Add prompt difficulty tiers to benchmark prompt versions so we can:

- keep seasons balanced across easy, medium, and hard prompts
- inspect whether rankings are robust across tiers
- avoid having a public benchmark dominated by only simple CRUD prompts

Difficulty tier should influence season design and diagnostics first. Assign tiers through a documented rubric that considers category breadth, integration count, operational constraints, and domain complexity. If we ever weight by prompt tier later, that should use the same immutable snapshot pattern as model weights.

### 8. Public benchmark pages should publish only when sample size is good enough

We need publication thresholds in addition to parser/QC thresholds. If a category or head-to-head pair does not have enough benchmark evidence, it should show as insufficient data instead of pretending to be authoritative.

## Launch bar

Do not switch the public authoritative pages to benchmark data until all of the following are true:

- The active benchmark season has at least 21 published daily runs. Target 28 before public cutover.
- The benchmark methodology page is live and lists the active prompt panel, model panel, scoring version, parser version, and QC summary.
- If any public ranking is weighted, the methodology page lists the exact model weight snapshot used.
- Unknown benchmark tools are entering `tool_candidates`, not `tools`.
- No active-season model snapshot drift has been silently mixed into published benchmark data.
- Public benchmark history comes from real benchmark executions, not synthetic backfill with retroactive dates.
- Each public benchmark category has at least 3 eligible prompt versions in the season. Categories below that bar stay exploratory or display insufficient benchmark coverage.
- Each published category snapshot has at least 100 eligible benchmark selections and at least 3 completed model snapshots.
- Each published head-to-head snapshot has at least 30 decisive trials.

These numbers can be tuned later, but the first release should be stricter rather than looser.

## Data model additions

Use clearer internal names than the earlier proposal:

- `benchmark_protocol`
- `benchmark_season`
- `benchmark_run`
- `benchmark_prompt_version`
- `benchmark_model_snapshot`
- `benchmark_trial`
- `benchmark_trial_result`
- `benchmark_selection`
- `benchmark_leaderboard_snapshot`
- `benchmark_head_to_head_snapshot`
- `benchmark_model_weight_snapshot`
- `benchmark_model_weight`
- `tool_alias`
- `tool_candidate`

Human meanings:

- Season: the frozen panel for public claims
- Trial: one prompt version x model snapshot pair inside a season
- Trial result: one recorded execution of a trial inside a benchmark run
- Selection: one category-level `tool` or `none` outcome inside a trial result

Also change the prompt source of truth:

- `preseason_prompt` becomes the editable prompt registry and stores prompt content
- `benchmark_prompt_version` stores immutable frozen copies used by benchmark execution
- prompt files become import or export artifacts only during migration

Use these additional fields and enums beyond the earlier proposal:

- Add a prompt difficulty tier enum on `benchmark_prompt_versions`.
- Add a benchmark window type enum so snapshot windows are explicit, not stringly typed.
- Add a QC status enum for benchmark runs and snapshots.
- Add a model family key on `benchmark_model_snapshots` if the returned model string alone is not enough to group closely related variants later.
- Add model weight snapshot tables so weighted benchmark publications can point to immutable weight inputs.

## PR plan

Every PR should include the tests for the behavior it introduces. Do not defer the entire test burden to the end. Unless the local environment is blocked, each PR should also exit with `pnpm run check` and `pnpm run test` passing.

### PR1: Benchmark schema and protocol scaffolding

Goal:
Create the new benchmark tables, enums, and integrity constraints without disturbing exploration.

Scope:

- Extend `src/server/db/schema.ts` with the benchmark entities from this plan.
- Include explicit snapshot and run integrity constraints:
  - unique `(seasonId, scheduledFor)` on `benchmark_runs`
  - unique `(seasonId, promptVersionId, modelSnapshotId)` on `benchmark_trials`
  - unique `(runId, trialId)` on `benchmark_trial_results`
  - unique `(trialResultId, categoryId)` on `benchmark_selections`
  - canonical `tool_a_id < tool_b_id` on head-to-head snapshots
- Add prompt difficulty tier, benchmark window type, and QC status enums.
- Add prompt content storage to the existing `preseason_prompt` table so prompt text can move into the database.
- Add `benchmark_model_weight_snapshots` and `benchmark_model_weights`.
- Add `tool_aliases` and `tool_candidates`.
- Backfill `tool_aliases` from `tools.aliases`.
- Import current prompt markdown into the prompt table as a one-time migration step.
- Seed `benchmark-v2` protocol and a draft `season-1`.
- Do not backfill legacy recommendation rows into benchmark tables.

Tests:

- Schema integrity and uniqueness tests.
- Alias and tool candidate uniqueness tests.
- Selection integrity tests.
- Prompt content migration tests.

Exit criteria:

- Migration applies cleanly.
- Legacy exploration routes still work unchanged.

### PR2: Frozen benchmark inputs and season manifest

Goal:
Freeze the inputs the benchmark will rely on before any new execution happens.

Scope:

- Build benchmark prompt version freezing services:
  - snapshot database-backed prompt content
  - snapshot benchmark system prompt
  - store prompt hash
  - normalize eligible categories into `benchmark_prompt_version_categories`
  - assign prompt difficulty tier
- Add a documented prompt tier rubric and make tier assignment reviewable in admin or seed code.
- Replace file-based prompt loading with database-backed loading for active prompts.
- Add an export path for Promptfoo if shared prompt files are still needed outside the app.
- Build benchmark model snapshot freezing services:
  - persist requested model id
  - explicit inference params
  - provider
  - optional family key
  - deterministic flag
- Build season composition services:
  - attach frozen prompt versions to a season
  - attach frozen model snapshots to a season
  - generate `benchmark_trials`
- Seed `season-1` from the current 15 vibe-coder prompts and current model panel, but mark any under-covered categories as not yet benchmark-public.
- Add a machine-readable season manifest service or admin JSON view that lists:
  - active prompt versions
  - difficulty tiers
  - eligible categories
  - model snapshots
  - scoring and parser versions

Tests:

- Prompt freezing stores immutable snapshots.
- Eligible category normalization is exact.
- Season trial generation is stable and idempotent.
- Categories with fewer than 3 eligible prompt versions are flagged as below publication coverage.
- Database-backed prompt loading works without the markdown directory.

Exit criteria:

- We can create a frozen draft season without running the benchmark yet.

### PR3: Benchmark LLM contract and snapshot drift detection

Goal:
Make benchmark execution fully explicit and auditable at the model-call level.

Scope:

- Extend `src/server/llm/service/types.ts`, `src/server/llm/service/index.ts`,
  `src/server/llm/service/providers/base.ts`, and `src/server/llm/service/openrouter-client.ts`.
- Add explicit request params:
  - `temperature`
  - `topP`
  - `maxTokens`
  - `seed` when supported
- Return and persist:
  - requested model id
  - returned model id
  - finish reason
  - token usage
  - latency
- Define benchmark defaults for the first season, such as low temperature and fixed max tokens.
- Add active-season drift handling:
  - if a benchmark trial returns a model identity that no longer matches the frozen snapshot expectation, mark the trial result invalid
  - fail benchmark publication for that run
  - require a future season refresh instead of silently mixing snapshots

Tests:

- Request params are passed through to providers.
- Returned model id and usage metadata persist.
- Drift detection blocks publication.

Exit criteria:

- Benchmark calls are no longer dependent on provider defaults.

### PR4: Strict benchmark prompt builder, parser, runner, and cron

Goal:
Execute the benchmark with an appendix-first contract and idempotent run semantics.

Scope:

- Add:
  - `src/server/llm/benchmark/prompt-builder.ts`
  - `src/server/llm/benchmark/schema.ts`
  - `src/server/llm/benchmark/parser.ts`
  - `src/server/llm/benchmark/runner.ts`
  - `src/server/llm/benchmark/qc.ts`
  - `src/server/llm/benchmark/publisher.ts`
- Require every benchmark response to contain:
  - a short natural answer
  - one JSON appendix inside fixed benchmark tags
- Validate the appendix with Zod.
- Enforce exactly one eligible-category selection per category per trial.
- Implement `createOrLoadBenchmarkRun(seasonId, scheduledFor)` so runs resume instead of duplicating.
- Add a dedicated benchmark cron route. Keep the existing `/api/cron/run` route as exploration.
- Only execute missing or failed trials on rerun.
- Mark missing or malformed appendix output as `invalid_output`. Do not salvage prose.
- Persist QC summaries per run.

Tests:

- Prompt builder emits the strict appendix contract.
- Missing appendix, malformed JSON, extra categories, and missing categories all fail.
- Idempotent reruns fill only missing trials.
- Invalid outputs are stored as invalid, not rescued.

Exit criteria:

- The benchmark can run daily in shadow mode without duplicate run records.

### PR5: Tool governance, candidate review, and selection replay

Goal:
Remove benchmark auto-creation of tools and replace it with a reviewable resolution workflow.

Scope:

- Benchmark tool resolution order:
  1. exact tool name
  2. exact tool slug
  3. exact approved alias in `tool_aliases`
- Unmatched benchmark tools:
  - upsert into `tool_candidates`
  - keep the selection unresolved
  - exclude unresolved tools from public support counts
- Add minimal admin flows:
  - candidate queue
  - approve by linking to existing tool
  - approve by intentionally creating a new tool
  - add alias entry
  - replay affected benchmark selections after approval
- Leave exploration parser behavior alone for now.

Tests:

- Unknown tools no longer auto-create benchmark tools.
- Candidate upserts are idempotent.
- Approved aliases resolve correctly on replay.
- Unresolved selections do not enter published support counts.

Exit criteria:

- Benchmark tool membership is human-governed.

### PR6: Leaderboard snapshots, trends, and publication thresholds

Goal:
Replace raw recommendation aggregation with published benchmark snapshots.

Scope:

- Add benchmark leaderboard computation from `benchmark_selections`.
- Compute at least these snapshot windows:
  - `run_day`
  - `trailing_7d`
  - `trailing_28d`
  - `season_to_date`
- Make `trailing_28d` the default public benchmark window at launch.
- Support both scoring modes from day one:
  - uniform
  - model-weighted
- Persist the exact weight context used by each published snapshot:
  - `weightingMode`
  - `modelWeightSnapshotId`
- Primary published metrics:
  - unweighted support count
  - unweighted support rate
  - weighted support rate when weighting is enabled
- Statistical policy:
  - Wilson confidence intervals are computed on raw unweighted rates only
  - weighted rates are reported without pseudo-confidence intervals
- Publish:
  - support count
  - support rate
  - Wilson 95% CI
  - prompt coverage
  - model coverage
  - trend versus previous published snapshot
- Do not ship an authoritative overall leaderboard in this phase.
- Add publication thresholds:
  - category hidden or labeled insufficient data when below the benchmark bar
- Add secondary diagnostics:
  - per-difficulty-tier breakdown
  - model-family-balanced audit metric when weighting is enabled
- Add public query support for prompt difficulty tier filters on benchmark ranking endpoints.

Tests:

- Support rate uses eligible-selection denominators.
- Weighted snapshots use the correct immutable weight snapshot.
- Confidence intervals are stable.
- Trend compares the correct published snapshots.
- Insufficient-data categories do not publish authoritative ranks.

Exit criteria:

- We can publish benchmark-backed category rankings without touching legacy public routes yet.

### PR7: Head-to-head snapshots from trial outcomes

Goal:
Rebuild matches on top of benchmark selection outcomes instead of raw mention counts.

Scope:

- Add benchmark head-to-head snapshot computation.
- Use category selections to compute:
  - tool A wins
  - tool B wins
  - abstain
  - abstain_other
  - decisive trial count
  - decisive win rate
  - Wilson 95% CI
- Keep head-to-head primary scoring unweighted even when leaderboard weighting is enabled. If weighted head-to-head totals are shown at all, treat them as secondary diagnostics.
- Generate featured pairs from latest benchmark leaderboard snapshots or admin-curated pairs, not from raw all-time counts.
- Keep the old match table and routes alive until UI cutover.
- Require a minimum decisive-trial threshold before publishing a public head-to-head.

Tests:

- Head-to-head math comes from benchmark selections, not recommendation counts.
- Other-tool selections become abstain-other, not wins.
- Decisive win rate uses decisive trials only.
- Low-sample pairs stay unpublished.

Exit criteria:

- Benchmark match data exists independently from legacy `preseason_match`.

### PR8: Public API and UI cutover to benchmark snapshots

Goal:
Switch authoritative public pages to the new benchmark data model while preserving exploration surfaces.

Scope:

- Add benchmark-first routers for rankings, matches, runs, and trending.
- Update these public routes to read published benchmark snapshots only:
  - `/rankings`
  - `/rankings/[slug]`
  - `/rankings/[slug]/[subSlug]`
  - `/matches`
  - `/matches/[slug]`
  - `/trending`
- Keep these surfaces exploratory:
  - `/feed`
  - prompt detail raw history
  - llm detail raw history
- Add visible labels in UI:
  - `Benchmark`
  - `Exploration`
- Launch a real methodology page instead of the current placeholder:
  - active season manifest
  - public claim boundaries
  - prompt panel
  - model panel
  - active weight snapshot when applicable
  - prompt difficulty rubric
  - scoring methodology
  - QC summary
- Remove or relabel the current overall ranking as exploratory composite if we keep it at all.

Tests:

- Public pages no longer read directly from `preseason_recommendation` or legacy match counts.
- Exploration pages still work during migration.

Exit criteria:

- Public authority now flows through published benchmark snapshots only.

### PR9: Admin ops, shadow accumulation, and release cutover

Goal:
Make the benchmark operable week after week and only flip the public switch when the data is ready.

Scope:

- Add admin controls for:
  - creating seasons
  - freezing prompts and models
  - activating seasons
  - viewing benchmark runs
  - viewing QC summaries
  - publishing and unpublishing snapshots
  - reviewing tool candidates
- Run benchmark in shadow mode alongside exploration for at least 21 days, targeting 28.
- Add a launch readiness checklist in admin or docs:
  - enough published runs
  - enough public category coverage
  - no unresolved-tool backlog threatening QC
  - no snapshot drift incidents
  - methodology docs complete
- Gate public cutover behind a feature flag or explicit publish switch.
- Update:
  - `README.md`
  - `docs/guides/recommendation-methodology.md`
  - `docs/guides/how-cron-benchmarks-work.md`
  - `docs/guides/how-rankings-work.md`
  - the in-app methodology page

Tests:

- Partial runs resume safely.
- QC-failed runs do not publish.
- Shadow mode can coexist with exploration cron without collisions.
- Weighted publications keep pointing to the original immutable weight snapshot even after a newer snapshot exists.

Exit criteria:

- We can accumulate weeks of benchmark history before exposing it as public authority.

### PR10: Remove legacy exploration and file-backed prompt code

Goal:
Delete the old stack once the benchmark has replaced it.

Scope:

- Remove the legacy exploration ranking and match paths if they are no longer needed.
- Delete old recommendation-count-based match generation and settlement code.
- Delete legacy cron routes that only exist for the old methodology.
- Remove the file-based prompt loader and prompt markdown directory if Promptfoo export has been solved.
- Remove `tools.aliases` after `tool_aliases` has fully replaced it.
- Drop legacy tables that no longer serve any retained workflow.
- Trim or rewrite docs so they describe only the surviving system.

Tests:

- No application path still depends on deleted legacy tables or prompt files.
- Benchmark cron and public routes still work after cleanup.

Exit criteria:

- The repository reflects the benchmark architecture instead of carrying two full systems forever.

## Season 1 recommendations

For the first benchmark season:

- Scope claims honestly to "vibe-coder web-app prompts" because that is what the current prompt corpus represents.
- Keep the current provider-balanced model panel unless there is a strong reason to swap models before the shadow period starts.
- Add more prompt coverage before making categories like `cms` authoritative, because the current panel only covers them in 2 prompt metadata entries.
- Start with a uniform weight snapshot unless there is a specific reason to activate non-uniform weights immediately.
- Do not publish an overall "best tool overall" benchmark leaderboard yet.

## Non-goals for the first release

- Retroactively converting old exploration recommendations into authoritative benchmark evidence.
- Shipping hidden weighting. Any weighted publication must point to an immutable weight snapshot and still expose unweighted counts.
- Synthetic benchmark history created by replaying current runs and stamping old dates.
- Claiming coverage across all developer workflows or skill levels.
- Multi-turn benchmark interactions or heuristic parse recovery.

## Suggested implementation order

If we want benchmark history before the eventual public cutover, the order should be:

1. PR1 through PR4 first, so benchmark shadow runs can start as early as possible.
2. PR5 next, so unresolved tools do not pollute the benchmark during the shadow period.
3. PR6 and PR7 while history is accumulating.
4. PR8 and PR9 only after the benchmark has enough published runs to support real public pages.
5. PR10 last, once we are sure the legacy stack is no longer needed.

That sequencing is what lets Preseason launch with weeks of benchmark data already in hand instead of switching public authority on day one.
