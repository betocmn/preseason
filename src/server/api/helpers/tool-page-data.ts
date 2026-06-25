import { sql } from 'drizzle-orm'
import type { db as database } from '~/server/db'
import {
  prepareScoringContext,
  type WindowType,
  wilsonInterval,
} from '~/server/llm/benchmark/scoring'

type ToolPageCategory = {
  id: string
  name: string
  slug: string
  categoryGroup?: { slug: string } | null
}

type ToolPageTool = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  toolCategories: Array<{
    category: ToolPageCategory
  }>
}

type ToolBenchmarkPageDataOptions = {
  anchorDate?: string
  matchupLimit?: number
  windowType?: WindowType
}

type ToolAggregateRow = {
  category_id: string
  tool_id: string
  tool_name: string
  tool_slug: string
  tool_logo_url: string | null
  raw_support_count: number
  weighted_support: number
  raw_eligible_count: number
  weighted_eligible: number
  total_distinct_models: number
  total_distinct_prompts: number
}

type HeadToHeadAggregateRow = {
  category_id: string
  tool_b_id: string
  a_wins: number
  b_wins: number
  abstains: number
  other_tool_count: number
  weighted_a_wins: number
  weighted_b_wins: number
}

function uuidList(values: string[]) {
  return sql.join(
    values.map((value) => sql`${value}::uuid`),
    sql`, `,
  )
}

function groupByCategory(rows: ToolAggregateRow[]) {
  const grouped = new Map<string, ToolAggregateRow[]>()
  for (const row of rows) {
    const rowsForCategory = grouped.get(row.category_id) ?? []
    rowsForCategory.push(row)
    grouped.set(row.category_id, rowsForCategory)
  }
  return grouped
}

async function fetchToolRankingAggregates(
  db: typeof database,
  runIds: string[],
  categoryIds: string[],
) {
  return db.execute<ToolAggregateRow>(sql`
    with decision_rows as (
      select
        d.category_id,
        d.decision_type,
        d.tool_id,
        t.name as tool_name,
        t.slug as tool_slug,
        t.logo_url as tool_logo_url,
        c.model_snapshot_id,
        c.prompt_version_id,
        case ms.tier
          when 'frontier' then coalesce(w.frontier_weight, 1)
          when 'mid' then coalesce(w.mid_weight, 1)
          when 'small' then coalesce(w.small_weight, 1)
        end::float8 as weight
      from preseason_benchmark_case_decision d
      inner join preseason_benchmark_case_result cr on d.case_result_id = cr.id
      inner join preseason_benchmark_run r on cr.run_id = r.id
      inner join preseason_benchmark_case c on cr.case_id = c.id
      inner join preseason_benchmark_model_snapshot ms on c.model_snapshot_id = ms.id
      left join preseason_benchmark_model_weight_config w on r.weight_config_id = w.id
      left join preseason_tool t on d.tool_id = t.id
      where d.category_id in (${uuidList(categoryIds)})
        and cr.run_id in (${uuidList(runIds)})
        and cr.status = 'completed'
        and d.resolution_status = 'resolved'
        and d.decision_type != 'invalid'
    ),
    category_totals as (
      select
        category_id,
        count(*)::int as raw_eligible_count,
        coalesce(sum(weight), 0)::float8 as weighted_eligible,
        count(distinct model_snapshot_id)::int as total_distinct_models,
        count(distinct prompt_version_id)::int as total_distinct_prompts
      from decision_rows
      group by category_id
    ),
    tool_totals as (
      select
        category_id,
        tool_id,
        max(tool_name) as tool_name,
        max(tool_slug) as tool_slug,
        max(tool_logo_url) as tool_logo_url,
        count(*)::int as raw_support_count,
        coalesce(sum(weight), 0)::float8 as weighted_support
      from decision_rows
      where decision_type = 'tool' and tool_id is not null
      group by category_id, tool_id
    )
    select
      tt.category_id,
      tt.tool_id,
      tt.tool_name,
      tt.tool_slug,
      tt.tool_logo_url,
      tt.raw_support_count,
      tt.weighted_support,
      ct.raw_eligible_count,
      ct.weighted_eligible,
      ct.total_distinct_models,
      ct.total_distinct_prompts
    from tool_totals tt
    inner join category_totals ct on tt.category_id = ct.category_id
  `)
}

async function fetchHeadToHeadAggregates(
  db: typeof database,
  runIds: string[],
  pairs: Array<{ categoryId: string; toolAId: string; toolBId: string }>,
) {
  if (pairs.length === 0) return []

  const pairValues = sql.join(
    pairs.map(
      (pair) => sql`(${pair.categoryId}::uuid, ${pair.toolAId}::uuid, ${pair.toolBId}::uuid)`,
    ),
    sql`, `,
  )

  return db.execute<HeadToHeadAggregateRow>(sql`
    with pairs(category_id, tool_a_id, tool_b_id) as (
      values ${pairValues}
    ),
    decision_rows as (
      select
        p.category_id,
        p.tool_a_id,
        p.tool_b_id,
        d.decision_type,
        d.tool_id,
        case ms.tier
          when 'frontier' then coalesce(w.frontier_weight, 1)
          when 'mid' then coalesce(w.mid_weight, 1)
          when 'small' then coalesce(w.small_weight, 1)
        end::float8 as weight
      from pairs p
      inner join preseason_benchmark_case_decision d on d.category_id = p.category_id
      inner join preseason_benchmark_case_result cr on d.case_result_id = cr.id
      inner join preseason_benchmark_run r on cr.run_id = r.id
      inner join preseason_benchmark_case c on cr.case_id = c.id
      inner join preseason_benchmark_model_snapshot ms on c.model_snapshot_id = ms.id
      left join preseason_benchmark_model_weight_config w on r.weight_config_id = w.id
      where cr.run_id in (${uuidList(runIds)})
        and cr.status = 'completed'
        and d.resolution_status = 'resolved'
        and d.decision_type != 'invalid'
    )
    select
      category_id,
      tool_b_id,
      count(*) filter (
        where decision_type = 'tool' and tool_id = tool_a_id
      )::int as a_wins,
      count(*) filter (
        where decision_type = 'tool' and tool_id = tool_b_id
      )::int as b_wins,
      count(*) filter (
        where decision_type = 'none'
      )::int as abstains,
      count(*) filter (
        where decision_type = 'tool'
          and tool_id is not null
          and tool_id != tool_a_id
          and tool_id != tool_b_id
      )::int as other_tool_count,
      coalesce(
        sum(weight) filter (where decision_type = 'tool' and tool_id = tool_a_id),
        0
      )::float8 as weighted_a_wins,
      coalesce(
        sum(weight) filter (where decision_type = 'tool' and tool_id = tool_b_id),
        0
      )::float8 as weighted_b_wins
    from decision_rows
    group by category_id, tool_a_id, tool_b_id
  `)
}

export async function getToolBenchmarkPageData(
  db: typeof database,
  tool: ToolPageTool,
  options: ToolBenchmarkPageDataOptions = {},
) {
  const anchorDate = options.anchorDate ?? new Date().toISOString().slice(0, 10)
  const windowType = options.windowType ?? 'trailing_28d'
  const matchupLimit = options.matchupLimit ?? 6
  const categories = tool.toolCategories.map((tc) => tc.category)
  const categoryIds = categories.map((category) => category.id)

  if (categoryIds.length === 0) {
    return { rankings: [], matchups: [] }
  }

  const scoringCtx = await prepareScoringContext(db, undefined, windowType, anchorDate)
  if (scoringCtx.runIds.length === 0) {
    return { rankings: [], matchups: [] }
  }

  const aggregateRows = await fetchToolRankingAggregates(db, scoringCtx.runIds, categoryIds)
  const rowsByCategory = groupByCategory(aggregateRows)

  const rankingEntries = []
  const matchupPairs = []

  for (const category of categories) {
    const rankingItems = (rowsByCategory.get(category.id) ?? [])
      .map((row) => {
        const rawSupportCount = Number(row.raw_support_count)
        const rawEligibleCount = Number(row.raw_eligible_count)
        const weightedSupport = Number(row.weighted_support)
        const weightedEligible = Number(row.weighted_eligible)
        const ci = wilsonInterval(rawSupportCount, rawEligibleCount)

        return {
          toolId: row.tool_id,
          toolName: row.tool_name,
          toolSlug: row.tool_slug,
          toolLogoUrl: row.tool_logo_url,
          weightedSupportRate: weightedEligible > 0 ? weightedSupport / weightedEligible : 0,
          rawSupportRate: rawEligibleCount > 0 ? rawSupportCount / rawEligibleCount : 0,
          rawSupportCount,
          rawEligibleCount,
          ciLow: ci.low,
          ciHigh: ci.high,
          trend: 0,
          meetsPublicationThreshold:
            rawEligibleCount >= 100 &&
            Number(row.total_distinct_models) >= 3 &&
            Number(row.total_distinct_prompts) >= 3,
        }
      })
      .sort(
        (a, b) =>
          b.weightedSupportRate - a.weightedSupportRate ||
          b.ciLow - a.ciLow ||
          b.rawSupportCount - a.rawSupportCount ||
          a.toolName.localeCompare(b.toolName) ||
          a.toolId.localeCompare(b.toolId),
      )

    const toolIndex = rankingItems.findIndex((item) => item.toolId === tool.id)
    if (toolIndex === -1) continue

    const entry = rankingItems[toolIndex]
    if (!entry) continue

    rankingEntries.push({
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        groupSlug: category.categoryGroup?.slug ?? '',
      },
      rank: toolIndex + 1,
      totalTools: rankingItems.length,
      weightedSupportRate: entry.weightedSupportRate,
      rawSupportRate: entry.rawSupportRate,
      rawSupportCount: entry.rawSupportCount,
      rawEligibleCount: entry.rawEligibleCount,
      ciLow: entry.ciLow,
      ciHigh: entry.ciHigh,
      trend: entry.trend,
      meetsPublicationThreshold: entry.meetsPublicationThreshold,
    })

    if (rankingItems.length < 2) continue

    const rivalIndex = toolIndex === 0 ? 1 : toolIndex - 1
    const rival = rankingItems[rivalIndex]
    if (!rival) continue

    matchupPairs.push({
      category,
      rival,
      toolAId: tool.id,
      toolBId: rival.toolId,
    })
  }

  const headToHeadRows = await fetchHeadToHeadAggregates(
    db,
    scoringCtx.runIds,
    matchupPairs.map((pair) => ({
      categoryId: pair.category.id,
      toolAId: pair.toolAId,
      toolBId: pair.toolBId,
    })),
  )
  const headToHeadByPair = new Map(
    headToHeadRows.map((row) => [`${row.category_id}:${row.tool_b_id}`, row]),
  )

  const matchupEntries = matchupPairs.map((pair) => {
    const result = headToHeadByPair.get(`${pair.category.id}:${pair.toolBId}`)
    const aWins = Number(result?.a_wins ?? 0)
    const bWins = Number(result?.b_wins ?? 0)
    const abstains = Number(result?.abstains ?? 0)
    const otherToolCount = Number(result?.other_tool_count ?? 0)
    const decisiveCaseCount = aWins + bWins
    const aWinRate = decisiveCaseCount > 0 ? aWins / decisiveCaseCount : 0
    const bWinRate = decisiveCaseCount > 0 ? bWins / decisiveCaseCount : 0
    const ci = wilsonInterval(aWins, decisiveCaseCount)
    const weightedAWins = Number(result?.weighted_a_wins ?? 0)
    const weightedBWins = Number(result?.weighted_b_wins ?? 0)
    const weightedDecisive = weightedAWins + weightedBWins
    const weightedAWinRate = weightedDecisive > 0 ? weightedAWins / weightedDecisive : 0

    return {
      category: {
        id: pair.category.id,
        name: pair.category.name,
        slug: pair.category.slug,
      },
      toolA: {
        id: tool.id,
        name: tool.name,
        slug: tool.slug,
        logoUrl: tool.logoUrl,
      },
      toolB: {
        id: pair.rival.toolId,
        name: pair.rival.toolName,
        slug: pair.rival.toolSlug,
        logoUrl: pair.rival.toolLogoUrl,
      },
      result: {
        toolAId: tool.id,
        toolBId: pair.rival.toolId,
        categoryId: pair.category.id,
        aWins,
        bWins,
        abstains,
        otherToolCount,
        decisiveCaseCount,
        aWinRate,
        bWinRate,
        ciLow: ci.low,
        ciHigh: ci.high,
        weightedAWins,
        weightedBWins,
        weightedAWinRate,
        modelBreakdown: [],
        promptBreakdown: [],
        meetsPublicationThreshold: decisiveCaseCount >= 30,
      },
    }
  })

  rankingEntries.sort((a, b) => a.rank - b.rank)
  matchupEntries.sort((a, b) => b.result.decisiveCaseCount - a.result.decisiveCaseCount)

  return {
    rankings: rankingEntries,
    matchups: matchupEntries.slice(0, matchupLimit),
  }
}
