# How Rankings Work

## Overview

Authoritative rankings are computed from benchmark case decisions, not from the
removed exploration tables.

Public ranking reads now go through:

- `benchmarkRanking.byCategory`
- `benchmarkRanking.byCategoryGroup`

Both routers resolve the latest published benchmark season by default and ignore
exploration-mode seasons.

## Data Flow

```text
Published benchmark runs
  -> benchmark_case_result
  -> benchmark_case_decision
  -> scoring helpers
  -> public rankings and matches
```

The atomic input is one category-level case decision for one prompt x model
evaluation.

## Ranking Windows

Rankings support four explicit windows:

| Window | Meaning |
|--------|---------|
| `run_day` | The latest published run only |
| `trailing_7d` | The last 7 published runs |
| `trailing_28d` | The last 28 published runs |
| `season_to_date` | Every published run in the selected season |

These are slices of published runs, not calendar-day lookbacks over raw rows.

## Inputs

### `benchmarkRanking.byCategory`

| Param | Type | Notes |
|-------|------|-------|
| `categorySlug` | string | Required subcategory slug such as `auth` |
| `seasonId` | uuid | Optional; defaults to latest published benchmark season |
| `windowType` | enum | Defaults to `trailing_28d` |
| `anchorDate` | `YYYY-MM-DD` | Optional date for season resolution and window slicing |
| `promptTier` | enum | Optional `basic`, `intermediate`, or `advanced` |
| `modelTier` | enum | Optional `frontier`, `mid`, or `small` |

### `benchmarkRanking.byCategoryGroup`

Same filters, but `groupSlug` replaces `categorySlug` and the result aggregates
across every subcategory in that group.

## Metrics

Each ranked item exposes:

- `weightedSupportRate` - weighted support using the run's weight config
- `rawSupportRate` - unweighted support rate
- `rawSupportCount` and `rawEligibleCount`
- `modelCoverage` - fraction of distinct model snapshots recommending the tool
- `promptCoverage` - fraction of distinct prompt versions recommending the tool
- `ciLow` and `ciHigh` - Wilson 95% confidence interval on the raw rate
- `trend` - change versus the previous non-overlapping published-run window

Items are sorted by:

1. `weightedSupportRate`
2. `ciLow`
3. `rawSupportCount`

## Publication Thresholds

A ranking is only considered benchmark-ready when it has:

- At least 100 eligible decisions
- At least 3 distinct model snapshots
- At least 3 distinct prompt versions

The scoring result includes `meetsPublicationThreshold` so the UI can show an
honest "Insufficient benchmark data" state instead of overclaiming thin data.

## Category Groups vs. Subcategories

- Category rankings answer "Which tools lead within one subcategory?"
- Category-group rankings answer "Which tools lead across all subcategories in a
  group such as devtools?"

There is no separate legacy "overall ranking" router anymore.

## Related Code

- `src/server/api/routers/benchmark-ranking.ts`
- `src/server/llm/benchmark/scoring.ts`
- `docs/guides/how-benchmarks-work.md`
