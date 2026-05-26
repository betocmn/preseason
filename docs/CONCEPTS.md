# Concepts

This glossary defines the core terms used across Preseason docs and UI.

## Benchmark Protocol

Versioned rules for parsing, scoring, QC, and publication behavior.

## Season

A frozen benchmark panel (prompt versions + model snapshots) evaluated over
time. Seasons move through states such as draft, active, completed, and
archived.

## Prompt Version

Immutable snapshot of prompt content. Any edit creates a new version with a new
hash.

## Prompt Level

Prompt complexity tag: `beginner`, `intermediate`, or `advanced`.

## Model Snapshot

Immutable model configuration at run time (model ID + inference parameters).

## Model Tier

Capability group used in filtering and weighting (`frontier`, `mid`, `small`).

## Case

One prompt-version × model-snapshot pair in a season.

## Run

One scheduled benchmark execution batch for a season/day.

## Case Result

Raw output record for one case execution, including tokens, latency, and parser
outcome.

## Case Decision

Category-level normalized decision from a case result:

- `tool` (specific tool recommended)
- `none` (no tool recommended)
- `invalid` (output could not be accepted)

## Eligible Category

A category the prompt explicitly asks the model to decide for. Each eligible
category must have exactly one decision in the appendix.

## Tool Candidate Queue

Review queue for unresolved tool names produced by models. Candidates must be
approved before counting in rankings.

## Published Run

A run that passed QC and is eligible for public ranking reads.

## Ranking Window

Time slice over published runs:

- `run_day`
- `trailing_7d`
- `trailing_28d`
- `season_to_date`

## Support Rate

Fraction of eligible decisions selecting a tool in a category/window.

## Coverage

How broadly a result is supported:

- Model coverage: distinct model snapshots
- Prompt coverage: distinct prompt versions

## Wilson Interval

95% confidence interval for support-rate uncertainty.

## Publication Threshold

Minimum evidence needed before a category ranking is shown as benchmark-ready.

## Matchup

Head-to-head comparison between two tools in the same category.

## Cron Secret

Bearer token required for protected cron benchmark endpoints.
