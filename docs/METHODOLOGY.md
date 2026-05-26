# Methodology

This document explains what Preseason measures, how results are produced, and
what claims the rankings should and should not support.

## Research Question

When LLMs are asked to plan or scaffold realistic web/SaaS builds, which tools
do they recommend by category?

Preseason measures recommendation behavior, not objective product quality.

## Benchmark Design

### 1) Frozen Inputs

Each active season freezes:

- Prompt versions
- Model snapshots
- Parsing/scoring protocol

This prevents silent moving-target drift within a season.

### 2) Full Panel Evaluation

Runs execute the full prompt × model case matrix. Retries are idempotent, so
partial failures can resume without duplicating completed cases.

### 3) Structured Output Contract

Models must return a strict machine-readable appendix. For each eligible
category, the parser accepts exactly one decision:

- `tool`
- `none`
- `invalid`

Malformed output is not heuristically repaired.

### 4) Tool Normalization

Tool names are mapped to canonical catalog entries through exact/alias
normalization. Unknown names enter a review queue and do not count until
resolved.

## Scoring

Category rankings are computed from benchmark case decisions over explicit
published-run windows (`run_day`, `trailing_7d`, `trailing_28d`,
`season_to_date`).

Key reported metrics:

- Weighted and raw support rates
- Wilson 95% confidence intervals
- Model coverage and prompt coverage
- Trend vs. previous non-overlapping window

## Publication Quality Gates

Runs must pass QC before publication. Rankings are only displayed as
benchmark-ready when minimum evidence thresholds are met (decision count,
distinct prompts, distinct models).

These gates are designed to reduce overclaiming from thin data.

## Scope and Limits

Preseason results are scoped to:

- The active season's frozen prompt/model panel
- Prompt corpus emphasis (currently web and SaaS scenarios)
- The parser/protocol version active in that season

Therefore:

- A top-ranked tool is "most recommended in this benchmark scope," not
  "objectively best for every project."
- Unresolved tool-name candidates are held out until reviewed.
- Changes in prompt/model panels across seasons can shift rankings.

## Reproducibility Commitments

- Versioned prompt and model snapshots
- Persisted run/case/decision records
- Public methodology and architecture docs
- CI checks for code and schema consistency

## Citation Guidance

When citing results externally, include:

1. Season identifier
2. Ranking window
3. Category
4. Date (or anchor date)

Example:
"Preseason Season 1 trailing-28d (May 2026), database category."
