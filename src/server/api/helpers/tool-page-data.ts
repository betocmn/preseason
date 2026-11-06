import { serverSettings } from '~/constants/server-settings'
import type { db as database } from '~/server/db'
import {
  computeCategoryRankings,
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

export async function getToolBenchmarkPageData(
  db: typeof database,
  tool: ToolPageTool,
  options: ToolBenchmarkPageDataOptions = {},
) {
  const anchorDate = options.anchorDate ?? new Date().toISOString().slice(0, 10)
  const windowType = options.windowType ?? serverSettings.publicSite.toolPage.windowType
  const matchupLimit = options.matchupLimit ?? serverSettings.publicSite.toolPage.matchupLimit
  const rankingEntries = []
  const matchupEntries = []

  // Cache each category independently so tools with overlapping categories reuse
  // the same summary. Read sequentially to bound database work on a cold cache.
  for (const { category } of tool.toolCategories) {
    const [ranking] = await computeCategoryRankings(db, {
      categoryIds: [category.id],
      windowType,
      anchorDate,
    })
    if (!ranking) continue

    const toolIndex = ranking.items.findIndex((item) => item.toolId === tool.id)
    const entry = ranking.items[toolIndex]
    if (!entry) continue

    rankingEntries.push({
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
        groupSlug: category.categoryGroup?.slug ?? '',
      },
      rank: toolIndex + 1,
      totalTools: ranking.items.length,
      weightedSupportRate: entry.weightedSupportRate,
      rawSupportRate: entry.rawSupportRate,
      rawSupportCount: entry.rawSupportCount,
      rawEligibleCount: entry.rawEligibleCount,
      ciLow: entry.ciLow,
      ciHigh: entry.ciHigh,
      trend: entry.trend,
      meetsPublicationThreshold: ranking.meetsPublicationThreshold,
    })

    const rival = ranking.items[toolIndex === 0 ? 1 : toolIndex - 1]
    if (!rival) continue

    // Eligible decisions are either a resolved tool choice or an abstention.
    // The category summary already contains every total needed by these cards;
    // scanning the decision history again for each tool pair is unnecessary.
    const toolChoices = ranking.items.reduce((total, item) => total + item.rawSupportCount, 0)
    const aWins = entry.rawSupportCount
    const bWins = rival.rawSupportCount
    const decisiveCaseCount = aWins + bWins
    const weightedAWins = entry.weightedSupport
    const weightedBWins = rival.weightedSupport
    const weightedDecisive = weightedAWins + weightedBWins
    const ci = wilsonInterval(aWins, decisiveCaseCount)

    matchupEntries.push({
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug,
      },
      toolA: {
        id: tool.id,
        name: tool.name,
        slug: tool.slug,
        logoUrl: tool.logoUrl,
      },
      toolB: {
        id: rival.toolId,
        name: rival.toolName,
        slug: rival.toolSlug,
        logoUrl: rival.toolLogoUrl,
      },
      result: {
        toolAId: tool.id,
        toolBId: rival.toolId,
        categoryId: category.id,
        aWins,
        bWins,
        abstains: ranking.totalEligibleDecisions - toolChoices,
        otherToolCount: toolChoices - decisiveCaseCount,
        decisiveCaseCount,
        aWinRate: decisiveCaseCount > 0 ? aWins / decisiveCaseCount : 0,
        bWinRate: decisiveCaseCount > 0 ? bWins / decisiveCaseCount : 0,
        ciLow: ci.low,
        ciHigh: ci.high,
        weightedAWins,
        weightedBWins,
        weightedAWinRate: weightedDecisive > 0 ? weightedAWins / weightedDecisive : 0,
        modelBreakdown: [],
        promptBreakdown: [],
        meetsPublicationThreshold:
          decisiveCaseCount >= serverSettings.publicSite.headToHeadMinimumDecisiveCases,
      },
    })
  }

  rankingEntries.sort((a, b) => a.rank - b.rank)
  matchupEntries.sort((a, b) => b.result.decisiveCaseCount - a.result.decisiveCaseCount)

  return {
    rankings: rankingEntries,
    matchups: matchupEntries.slice(0, matchupLimit),
  }
}
