# How Benchmarks Work

This document explains Preseason's benchmark pipeline — the system that produces
authoritative, reproducible rankings of developer tools based on LLM recommendations.

## Overview

The benchmark pipeline replaces the earlier exploration pipeline with a rigorous,
auditable protocol. Every piece of data that feeds into a public ranking is
immutable, versioned, and traceable back to the exact prompt text, model configuration,
and inference parameters that produced it.

The core question the benchmark answers: **"When LLMs are asked to recommend tools
for realistic development scenarios, which tools do they consistently choose?"**

## Key Concepts

### Protocol

A versioned methodology definition that pins the parser version, scoring rules,
and prompt contract version. Protocols rarely change — a new protocol means the
scoring methodology itself has changed.

### Season

A frozen evaluation panel: a specific set of prompt versions and model snapshots
that are tested together. Think of it as a benchmark edition. Seasons have a
lifecycle: `draft` → `active` → `completed` → `archived`.

During a season:
- The prompt panel is frozen (no adding/removing prompts)
- The model panel is frozen (no adding/removing models)
- Daily runs produce new data points against the same panel

### Prompt Versions

Immutable snapshots of prompt content. When a prompt is edited, a new version is
created with a new content hash. Old versions remain intact so historical results
always reference the exact text that was sent to the model.

Each prompt version has:
- **Content hash** — SHA-256 of the prompt markdown, used for deduplication
- **Difficulty tier** — `basic`, `intermediate`, or `advanced` based on the
  complexity of the development scenario
- **Eligible categories** — explicit list of which tool categories the prompt
  should produce recommendations for

### Model Snapshots

Immutable records of a model's configuration at evaluation time. A snapshot captures
the model ID, provider, inference parameters (temperature, top_p, max_tokens, seed),
and capability tier.

Each model snapshot has:
- **Snapshot key** — derived from `(model_id, temperature, top_p, max_tokens, seed)`,
  used for deduplication
- **Capability tier** — `frontier`, `mid`, or `small` based on the model's
  published benchmarks and parameter count
- **Model family key** — groups related model variants (e.g., all `claude-3-opus`
  checkpoints) for drift detection

### Cases

The cartesian product of a season's prompt versions and model snapshots. If a
season has 15 prompts and 8 models, it has 120 cases. Each case represents one
specific evaluation: "What does this model recommend for this prompt?"

### Runs

One execution batch on one date within a season. Runs are **idempotent by
`(season, date)`** — if a run is interrupted and restarted, it only executes
cases that don't already have results. This means cron failures are self-healing.

Runs go through a lifecycle: `pending` → `running` → `published` on QC-passing
success, or `failed` / `qc_failed` on terminal failure. Older legacy runs may
still exist in `completed` status and can be backfilled to `published`
manually, but successful new runs auto-publish once quality control passes.

### Case Results

The full record of one LLM call for one case in one run. Stores the complete
response, parsed appendix, token usage, latency, and the actual model ID returned
by the provider (for drift detection).

### Case Decisions

The atomic unit of benchmark data. One category-level tool choice extracted from
a case result. For each eligible category in a prompt, the model's response
produces exactly one decision:

- **`tool`** — the model recommended a specific tool (e.g., "Supabase" for database)
- **`none`** — the model said no tool is needed for this category
- **`invalid`** — the response couldn't be parsed for this category

Rankings are computed directly from case decisions — they are the fundamental
building block of all benchmark output.

## The Benchmark Prompt Contract

In benchmark mode, the model must return a structured appendix alongside its
natural language response:

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

Rules:
- Exactly one entry for every eligible category (no extras, no omissions)
- `decision` must be `tool` or `none`
- When `decision = tool`, the `tool` field is required
- When `decision = none`, the `tool` field must be absent
- Valid JSON inside the delimiter tags

**There is no heuristic parsing.** If the appendix is malformed, the case result
is marked `invalid_output`. The benchmark never guesses what the model meant.

## Tool Resolution

When a model recommends a tool by name, the system resolves it:

1. **Exact match** against known tool names, slugs, and approved aliases
2. **No match** → the name goes into a **tool candidate queue** for admin review

There is no fuzzy matching and no auto-creation of tools. Unknown tool names get
`tool_id = null` in the decision row and `resolution_status = 'unresolved_tool'`.
An admin must approve the candidate (linking it to an existing tool or creating a
new one) before the decision counts in rankings.

### Tool Aliases

The `tool_aliases` table provides a normalized mapping from alternate names to
canonical tools. For example, "Supa Base", "supabase.io", and "Supabase DB" can
all map to the canonical "Supabase" tool. Aliases are stored with a normalized
form (lowercased, trimmed) to ensure consistent matching.

## Scoring and Rankings

Rankings are computed from case decisions over explicit time windows:

| Window | Meaning |
|--------|---------|
| `run_day` | Single run (diagnostics) |
| `trailing_7d` | Last 7 published runs |
| `trailing_28d` | Last 28 published runs (default public view) |
| `season_to_date` | All published runs in the season |

### Category Rankings

For each tool in a category, the system computes:

- **Support rate** — what fraction of eligible decisions selected this tool
- **Wilson 95% CI** — confidence interval on the support rate
- **Model coverage** — how many distinct models recommended this tool
- **Prompt coverage** — how many distinct prompts led to this tool
- **Trend** — change in support rate vs. the previous non-overlapping window

Rankings are sorted by support rate, with CI lower bound as tiebreaker.

### Model-Weighted Scoring

Each decision carries a weight based on its model's capability tier. Season 1
launches with **uniform weights** (all tiers = 1.0), making weighted and raw
rates identical. The weighting infrastructure exists so future seasons can
assign different weights without code changes — only a config update.

Weight configs are versioned and snapshotted per run, so historical results
always reference the exact weights that produced them.

### Publication Thresholds

A category ranking is only published as authoritative when:
- >= 100 eligible decisions in the window
- >= 3 distinct model snapshots contributing
- >= 3 distinct prompt versions contributing

Categories below these thresholds show "Insufficient benchmark data" instead of
potentially misleading thin-coverage rankings.

### Filtering

Public rankings support two filters that compose:

- **Prompt tier** — "What do models recommend for hard problems?" (`advanced`)
  vs. simple ones (`basic`)
- **Model tier** — "What do frontier models recommend?" (`frontier`) vs. all models

These filters are where defensibility comes from. "Supabase is the #1 database
for complex SaaS projects according to 8 frontier/mid-tier LLMs across 12
advanced prompts" is a much stronger claim than "Supabase gets mentioned a lot."

## Head-to-Head Matchups

For any two tools in the same category, the system computes:

- How many case decisions picked Tool A vs Tool B
- Win rate among decisive cases (excluding abstentions and other-tool picks)
- Wilson 95% CI on the win rate

Head-to-heads require >= 30 decisive trials to publish. Below that, the matchup
shows "Not enough data."

## Quality Control

Before a run can be published, it must pass QC checks:

| Check | Threshold |
|-------|-----------|
| Completed case rate | >= 95% |
| Invalid output rate | <= 5% |
| Unresolved tool rate | <= 2% |
| Distinct model snapshots with results | >= 3 |
| Distinct prompt versions with results | >= 5 |

QC summaries are persisted as JSON on the run record for audit.

### Model Drift Detection

If the provider returns a different model ID than what was requested (e.g.,
OpenRouter silently swaps the model behind an alias), the case result is
marked `invalid_output` with reason `model_drift`. Runs with drifted results
fail QC and cannot be published.

## Database Schema

The benchmark pipeline uses these tables (all prefixed with `preseason_`):

### Core Tables
- `benchmark_protocol` — methodology version
- `benchmark_season` — frozen evaluation panel
- `benchmark_prompt_version` — immutable prompt snapshots
- `benchmark_prompt_version_category` — eligible categories per prompt version
- `benchmark_model_snapshot` — immutable model configurations
- `benchmark_model_weight_config` — versioned tier weights

### Panel Tables
- `benchmark_season_prompt` — which prompt versions are in a season
- `benchmark_season_model` — which model snapshots are in a season
- `benchmark_case` — the prompt × model matrix for a season

### Execution Tables
- `benchmark_run` — one batch per date, idempotent by `(season, date)`
- `benchmark_case_result` — full LLM response record
- `benchmark_case_decision` — one category-level tool choice per eligible category

### Tool Resolution Tables
- `tool_alias` — normalized alias → canonical tool mapping
- `tool_candidate` — review queue for unknown tool mentions

## Rollout Plan

The benchmark pipeline is being built across 8 PRs:

1. **Schema + aliases** — all new tables and enums (this PR)
2. **Prompts to DB** — move prompts from disk files to database, build prompt contract
3. **LLM service hardening** — persist inference params, model snapshots, drift detection
4. **Benchmark runner** — the execution engine with idempotent runs
5. **Scoring + rankings** — weighted category rankings and head-to-heads
6. **Admin controls** — season management, tool candidate review, run publication
7. **Public switchover** — wire public pages to benchmark data
8. **Legacy cleanup** — remove old exploration pipeline

PRs 1-4 must land first to start shadow mode (running daily alongside the old
pipeline). PRs 5-6 can be built while shadow data accumulates. PR 7 only ships
after the launch bar is met (>= 21 published runs, sufficient category coverage).

## Launch Bar

The benchmark does not go public until ALL of these are true:

- >= 21 published daily runs in the active season
- >= 3 eligible prompt versions per public category
- >= 100 eligible benchmark decisions per public category
- >= 3 completed model snapshots per public category
- >= 30 decisive trials per published head-to-head
- Methodology page is live
- Zero model snapshot drift incidents in published runs

## Honest Scope

The benchmark's prompt panel currently covers **web application development
scenarios** (vibe-coder prompts for building SaaS, blogs, e-commerce, etc.).
Rankings reflect LLM recommendations for this specific domain. The benchmark
does not claim to cover all developer workflows — that requires expanding the
prompt panel in future seasons.
