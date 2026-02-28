# How Rankings Work

## Overview

Rankings measure how frequently LLMs recommend each tool, computed from the `preseason_recommendation` table. There are two ranking modes: **by category** (e.g. "top auth tools") and **overall** (across all categories). Both are public, read-only endpoints on the `rankingRouter`.

## Data flow

```
Prompts → LLMs → Run Results → Recommendations → Rankings
```

Each cron/manual run sends prompts to LLMs. Each LLM response is parsed into individual tool recommendations, stored with a `toolId`, `categoryId`, and `runResultId`. Rankings aggregate these recommendations over a configurable time window.

## Time windows

Both ranking endpoints accept a `days` parameter (1-365, default 30). This defines two windows:

| Window | Range | Purpose |
|--------|-------|---------|
| Current | `now - days` to `now` | Active ranking data |
| Previous | `now - 2*days` to `now - days` | Comparison period for trend |

The **trend** for each tool is `currentRate - previousRate`, showing whether a tool is being recommended more or less than the prior period.

## Ranking by category (`ranking.byCategorySlug`)

Ranks tools within a single category (e.g. "auth", "database").

### Input

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `categorySlug` | string | required | Category to rank (e.g. `"auth"`) |
| `days` | int | 30 | Time window in days |
| `limit` | int | 50 | Max results |

### Metrics

- **recommendationRate** — `toolRecommendations / totalRecommendations` in the current window (0-1)
- **consistencyScore** — fraction of distinct LLMs that recommended this tool: `llmsRecommendingTool / totalDistinctLlms` (0-1)
- **trend** — `currentRate - previousRate` (positive = trending up)

### Sort order

Tools are sorted by:

1. `recommendationRate` (descending)
2. `consistencyScore` (tiebreaker)
3. `recommendationCount` (second tiebreaker)

### Output

Returns the category metadata, the time window, and a ranked list of items with tool info + metrics. Returns empty items for unknown category slugs.

## Overall ranking (`ranking.overall`)

Ranks tools across all categories using a composite score.

### Input

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `days` | int | 30 | Time window in days |
| `limit` | int | 50 | Max results |

### Metrics

Same as by-category, plus:

- **categoryCoverage** — number of distinct categories in which the tool was recommended
- **score** — weighted composite: `recommendationRate * 0.6 + consistencyScore * 0.3 + categoryCoverage * 0.1`

### Sort order

Tools are sorted by `score` descending, with `recommendationRate` as tiebreaker.

### Output

Returns the time window and a ranked list of items with tool info, all metrics, and the composite score.

## Key tables involved

| Table | Role |
|-------|------|
| `preseason_recommendation` | Source data — one row per tool recommendation |
| `preseason_tool` | Tool metadata (name, slug) |
| `preseason_category` | Category metadata (name, slug) |
| `preseason_llm` | LLM metadata (used for consistency score) |
| `preseason_run_result` | Links recommendations to LLMs via `llmId` |

## Code location

The ranking router lives at `src/server/api/routers/ranking.ts`.
