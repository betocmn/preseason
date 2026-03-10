# Benchmark Refactoring Plan

## Purpose

Rebuild Preseason's public methodology so authoritative rankings and matches come from a frozen, reproducible benchmark protocol instead of the current exploration pipeline.

This plan is intentionally non-destructive:

- Keep the current exploration pipeline, tables, and routes working during migration.
- Build benchmark infrastructure in parallel.
- Switch only the authoritative public surfaces to benchmark data after the new protocol has accumulated enough history to support public claims.

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

### 2. The season is the unit of public claim

Public claims must be scoped to a frozen prompt panel and frozen model panel. We should say "within Benchmark Season 1" rather than implying universal truth across all developer workflows.

### 3. We cannot defensibly backfill legacy exploration data into benchmark tables

Old `preseason_recommendation` rows do not carry immutable prompt snapshots, frozen model snapshots, or explicit inference params. They can remain valuable as exploration history, but they should not become authoritative benchmark evidence.

### 4. To launch with weeks of benchmark data, run the new protocol in shadow first

The correct path is:

1. Land the benchmark pipeline behind admin and internal routes.
2. Run it daily in parallel with exploration.
3. Accumulate at least several weeks of benchmark snapshots.
4. Cut public authoritative pages over only after the benchmark history is real.

### 5. Do not use opaque model weighting as the primary public score

Model-weighted rankings are tempting, but they make the public score harder to explain and easier to challenge. For launch, the better approach is:

- Keep the season's model panel intentionally balanced.
- Use unweighted support rate across the frozen case panel as the primary public metric.
- Expose model coverage and, if needed later, a secondary model-family-balanced audit metric.

Given the current seed panel is already close to provider-balanced, composition discipline is a better first control than hidden weights.

### 6. Prompt difficulty tiers should exist, but as a panel-design and audit tool first

Add prompt difficulty tiers to benchmark prompt versions so we can:

- keep seasons balanced across easy, medium, and hard prompts
- inspect whether rankings are robust across tiers
- avoid having a public benchmark dominated by only simple CRUD prompts

Difficulty tier should not become a hidden scoring weight in the first public release. The public benchmark should remain simple to explain.

### 7. Public benchmark pages should publish only when sample size is good enough

We need publication thresholds in addition to parser/QC thresholds. If a category or head-to-head pair does not have enough benchmark evidence, it should show as insufficient data instead of pretending to be authoritative.

## Launch bar

Do not switch the public authoritative pages to benchmark data until all of the following are true:

- The active benchmark season has at least 21 published daily runs. Target 28 before public cutover.
- The benchmark methodology page is live and lists the active prompt panel, model panel, scoring version, parser version, and QC summary.
- Unknown benchmark tools are entering `tool_candidates`, not `tools`.
- No active-season model snapshot drift has been silently mixed into published benchmark data.
- Each public benchmark category has at least 3 eligible prompt versions in the season. Categories below that bar stay exploratory or display insufficient benchmark coverage.
- Each published category snapshot has at least 100 eligible benchmark decisions and at least 3 completed model snapshots.
- Each published head-to-head snapshot has at least 30 decisive cases.

These numbers can be tuned later, but the first release should be stricter rather than looser.

## Data model additions

Adopt the terminology from the benchmark rebuild proposal:

- `benchmark_protocol`
- `benchmark_season`
- `benchmark_run`
- `benchmark_prompt_version`
- `benchmark_model_snapshot`
- `benchmark_case`
- `benchmark_case_result`
- `benchmark_case_decision`
- `benchmark_leaderboard_snapshot`
- `benchmark_head_to_head_snapshot`
- `tool_alias`
- `tool_candidate`

Use these additional fields and enums beyond the earlier proposal:

- Add a prompt difficulty tier enum on `benchmark_prompt_versions`.
- Add a benchmark window type enum so snapshot windows are explicit, not stringly typed.
- Add a QC status enum for benchmark runs and snapshots.
- Add a model family key on `benchmark_model_snapshots` if the returned model string alone is not enough to group closely related variants later.

## PR plan

Every PR should include the tests for the behavior it introduces. Do not defer the entire test burden to the end.

### PR1: Benchmark schema and protocol scaffolding

Goal:
Create the new benchmark tables, enums, and integrity constraints without disturbing exploration.

Scope:

- Extend `src/server/db/schema.ts` with the benchmark entities from the rebuild proposal.
- Include explicit snapshot and run integrity constraints:
  - unique `(seasonId, scheduledFor)` on `benchmark_runs`
  - unique `(seasonId, promptVersionId, modelSnapshotId)` on `benchmark_cases`
  - unique `(runId, caseId)` on `benchmark_case_results`
  - unique `(caseResultId, categoryId)` on `benchmark_case_decisions`
  - canonical `tool_a_id < tool_b_id` on head-to-head snapshots
- Add prompt difficulty tier, benchmark window type, and QC status enums.
- Add `tool_aliases` and `tool_candidates`.
- Backfill `tool_aliases` from `tools.aliases`.
- Seed `benchmark-v2` protocol and a draft `season-1`.
- Do not backfill legacy recommendation rows into benchmark tables.

Tests:

- Schema integrity and uniqueness tests.
- Alias and tool candidate uniqueness tests.
- Decision integrity tests.

Exit criteria:

- Migration applies cleanly.
- Legacy exploration routes still work unchanged.

### PR2: Frozen benchmark inputs and season manifest

Goal:
Freeze the inputs the benchmark will rely on before any new execution happens.

Scope:

- Build benchmark prompt version freezing services:
  - snapshot markdown content
  - snapshot benchmark system prompt
  - store prompt hash
  - normalize eligible categories into `benchmark_prompt_version_categories`
  - assign prompt difficulty tier
- Build benchmark model snapshot freezing services:
  - persist requested model id
  - explicit inference params
  - provider
  - optional family key
  - deterministic flag
- Build season composition services:
  - attach frozen prompt versions to a season
  - attach frozen model snapshots to a season
  - generate `benchmark_cases`
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
- Season case generation is stable and idempotent.
- Categories with fewer than 3 eligible prompt versions are flagged as below publication coverage.

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
  - if a benchmark case returns a model identity that no longer matches the frozen snapshot expectation, mark the case invalid
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
- Enforce exactly one eligible-category decision per category per case.
- Implement `createOrLoadBenchmarkRun(seasonId, scheduledFor)` so runs resume instead of duplicating.
- Add a dedicated benchmark cron route. Keep the existing `/api/cron/run` route as exploration.
- Only execute missing or failed cases on rerun.
- Mark missing or malformed appendix output as `invalid_output`. Do not salvage prose.
- Persist QC summaries per run.

Tests:

- Prompt builder emits the strict appendix contract.
- Missing appendix, malformed JSON, extra categories, and missing categories all fail.
- Idempotent reruns fill only missing cases.
- Invalid outputs are stored as invalid, not rescued.

Exit criteria:

- The benchmark can run daily in shadow mode without duplicate run records.

### PR5: Tool governance, candidate review, and decision replay

Goal:
Remove benchmark auto-creation of tools and replace it with a reviewable resolution workflow.

Scope:

- Benchmark tool resolution order:
  1. exact tool name
  2. exact tool slug
  3. exact approved alias in `tool_aliases`
- Unmatched benchmark tools:
  - upsert into `tool_candidates`
  - keep the decision unresolved
  - exclude unresolved tools from public support counts
- Add minimal admin flows:
  - candidate queue
  - approve by linking to existing tool
  - approve by intentionally creating a new tool
  - add alias entry
  - replay affected benchmark case decisions after approval
- Leave exploration parser behavior alone for now.

Tests:

- Unknown tools no longer auto-create benchmark tools.
- Candidate upserts are idempotent.
- Approved aliases resolve correctly on replay.
- Unresolved decisions do not enter published support counts.

Exit criteria:

- Benchmark tool membership is human-governed.

### PR6: Leaderboard snapshots, trends, and publication thresholds

Goal:
Replace raw recommendation aggregation with published benchmark snapshots.

Scope:

- Add benchmark leaderboard computation from `benchmark_case_decisions`.
- Compute at least these snapshot windows:
  - `run_day`
  - `trailing_7d`
  - `trailing_28d`
  - `season_to_date`
- Make `trailing_28d` the default public benchmark window at launch.
- Primary public metric:
  - support rate over eligible benchmark decisions
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
- Add secondary diagnostics, not primary rank keys:
  - per-difficulty-tier breakdown
  - optional model-family-balanced audit metric if later needed

Tests:

- Support rate uses eligible-case denominators.
- Confidence intervals are stable.
- Trend compares the correct published snapshots.
- Insufficient-data categories do not publish authoritative ranks.

Exit criteria:

- We can publish benchmark-backed category rankings without touching legacy public routes yet.

### PR7: Head-to-head snapshots from case outcomes

Goal:
Rebuild matches on top of benchmark case outcomes instead of raw mention counts.

Scope:

- Add benchmark head-to-head snapshot computation.
- Use category decisions to compute:
  - tool A wins
  - tool B wins
  - abstain
  - abstain_other
  - decisive case count
  - decisive win rate
  - Wilson 95% CI
- Generate featured pairs from latest benchmark leaderboard snapshots or admin-curated pairs, not from raw all-time counts.
- Keep the old match table and routes alive until UI cutover.
- Require a minimum decisive-case threshold before publishing a public head-to-head.

Tests:

- Head-to-head math comes from case decisions, not recommendation counts.
- Other-tool selections become abstain-other, not wins.
- Decisive win rate uses decisive cases only.
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
  - scoring methodology
  - QC summary
- Remove or relabel the current overall ranking as exploratory.

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
  - `docs/guides/how-automation-works.md`
  - `docs/guides/how-rankings-work.md`
  - the in-app methodology page

Tests:

- Partial runs resume safely.
- QC-failed runs do not publish.
- Shadow mode can coexist with exploration cron without collisions.

Exit criteria:

- We can accumulate weeks of benchmark history before exposing it as public authority.

## Season 1 recommendations

For the first benchmark season:

- Scope claims honestly to "vibe-coder web-app prompts" because that is what the current prompt corpus represents.
- Keep the current provider-balanced model panel unless there is a strong reason to swap models before the shadow period starts.
- Add more prompt coverage before making categories like `cms` authoritative, because the current panel only covers them in 2 prompt metadata entries.
- Do not publish an overall "best tool overall" benchmark leaderboard yet.

## Non-goals for the first release

- Retroactively converting old exploration recommendations into authoritative benchmark evidence.
- Shipping a hidden weighted-score public ranking.
- Claiming coverage across all developer workflows or skill levels.
- Deleting legacy exploration tables, routes, or cron jobs in the first wave.
- Multi-turn benchmark interactions or heuristic parse recovery.

## Suggested implementation order

If we want benchmark history before the eventual public cutover, the order should be:

1. PR1 through PR4 first, so benchmark shadow runs can start as early as possible.
2. PR5 next, so unresolved tools do not pollute the benchmark during the shadow period.
3. PR6 and PR7 while history is accumulating.
4. PR8 and PR9 only after the benchmark has enough published runs to support real public pages.

That sequencing is what lets Preseason launch with weeks of benchmark data already in hand instead of switching public authority on day one.
