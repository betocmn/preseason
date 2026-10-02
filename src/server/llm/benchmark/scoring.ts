import { and, desc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '~/server/db/schema'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkModelSnapshots,
  benchmarkModelWeightConfigs,
  benchmarkPromptVersions,
  benchmarkProtocols,
  benchmarkRuns,
  benchmarkSeasons,
  tools,
} from '~/server/db/schema'
import type { PromptLevel } from '~/server/llm/prompts'
import { cachedPublicScoring } from './public-cache'
import {
  queryHeadToHeadAggregates,
  queryRankingAggregates,
  type RankingAggregate,
} from './scoring-queries'

type DatabaseClient = PostgresJsDatabase<typeof schema>

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WindowType = 'run_day' | 'trailing_7d' | 'trailing_28d' | 'season_to_date'
export type ModelTier = 'frontier' | 'mid' | 'small'
type ModelSelectionFilters = {
  modelSnapshotId?: string
  modelSnapshotIds?: string[]
  modelRangeId?: string
}

// Calendar date-range bounds for the public "last month / 3 / 6 / all time" filter.
// When `startDate` is set, only runs with scheduledFor in [startDate, anchorDate] count.
// When `previousStartDate` is set, the trend baseline is the preceding period
// [previousStartDate, startDate).
type DateRangeFilters = {
  startDate?: string // YYYY-MM-DD inclusive lower bound
  previousStartDate?: string // YYYY-MM-DD inclusive lower bound of the prior period
}

export type ScoringFilters = {
  categoryId: string
  seasonId?: string
  windowType: WindowType
  anchorDate: string // YYYY-MM-DD
  promptLevel?: PromptLevel
  modelTier?: ModelTier
} & ModelSelectionFilters &
  DateRangeFilters

export type ToolRankingEntry = {
  toolId: string
  toolName: string
  toolSlug: string
  toolLogoUrl: string | null
  weightedSupport: number
  weightedEligible: number
  weightedSupportRate: number
  rawSupportCount: number
  rawEligibleCount: number
  rawSupportRate: number
  modelCoverage: number
  promptCoverage: number
  ciLow: number
  ciHigh: number
  trend: number
}

export type CategoryRankingResult = {
  categoryId: string
  windowType: WindowType
  anchorDate: string
  items: ToolRankingEntry[]
  totalEligibleDecisions: number
  totalDistinctModels: number
  totalDistinctPrompts: number
  meetsPublicationThreshold: boolean
}

export type HeadToHeadFilters = {
  categoryId: string
  seasonId?: string
  toolAId: string
  toolBId: string
  windowType: WindowType
  anchorDate: string
  promptLevel?: PromptLevel
  modelTier?: ModelTier
} & ModelSelectionFilters

type RankingFilters = {
  seasonId?: string
  windowType: WindowType
  anchorDate: string
  promptLevel?: PromptLevel
  modelTier?: ModelTier
} & ModelSelectionFilters &
  DateRangeFilters

export type HeadToHeadResult = {
  toolAId: string
  toolBId: string
  categoryId: string
  aWins: number
  bWins: number
  abstains: number
  otherToolCount: number
  decisiveCaseCount: number
  aWinRate: number
  bWinRate: number
  ciLow: number
  ciHigh: number
  weightedAWins: number
  weightedBWins: number
  weightedAWinRate: number
  modelBreakdown: HeadToHeadBreakdownEntry[]
  promptBreakdown: HeadToHeadBreakdownEntry[]
  meetsPublicationThreshold: boolean
}

export type HeadToHeadBreakdownEntry = {
  id: string
  label: string
  tier: PromptLevel | ModelTier
  aWins: number
  bWins: number
  abstains: number
  otherToolCount: number
  decisiveCaseCount: number
  aWinRate: number
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function wilsonInterval(successes: number, trials: number, z = 1.96) {
  if (trials === 0) return { low: 0, high: 0 }
  const p = successes / trials
  const z2 = z * z
  const denominator = 1 + z2 / trials
  const center = p + z2 / (2 * trials)
  const spread = z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))
  return {
    low: Math.max(0, (center - spread) / denominator),
    high: Math.min(1, (center + spread) / denominator),
  }
}

export function getWeightForTier(
  config: { frontierWeight: number; midWeight: number; smallWeight: number },
  tier: ModelTier,
): number {
  switch (tier) {
    case 'frontier':
      return config.frontierWeight
    case 'mid':
      return config.midWeight
    case 'small':
      return config.smallWeight
  }
}

function getWindowSize(windowType: WindowType): number | null {
  switch (windowType) {
    case 'run_day':
      return 1
    case 'trailing_7d':
      return 7
    case 'trailing_28d':
      return 28
    case 'season_to_date':
      return null
  }
}

export function sliceRunIdsForWindow(runIds: string[], windowType: WindowType, offset = 0) {
  const size = getWindowSize(windowType)
  if (size == null) {
    return offset === 0 ? [...runIds] : []
  }

  return runIds.slice(offset, offset + size)
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

async function getPublishedRunIds(
  db: DatabaseClient,
  seasonId: string | undefined,
  anchorDate: string,
  startDate?: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: benchmarkRuns.id })
    .from(benchmarkRuns)
    .innerJoin(benchmarkSeasons, eq(benchmarkRuns.seasonId, benchmarkSeasons.id))
    .innerJoin(benchmarkProtocols, eq(benchmarkSeasons.protocolId, benchmarkProtocols.id))
    .where(
      and(
        seasonId ? eq(benchmarkRuns.seasonId, seasonId) : undefined,
        eq(benchmarkRuns.status, 'published'),
        eq(benchmarkProtocols.mode, 'benchmark'),
        lte(benchmarkRuns.scheduledFor, anchorDate),
        startDate ? gte(benchmarkRuns.scheduledFor, startDate) : undefined,
      ),
    )
    .orderBy(
      desc(benchmarkRuns.scheduledFor),
      desc(benchmarkSeasons.createdAt),
      desc(benchmarkRuns.id),
    )

  return rows.map((r) => r.id)
}

/**
 * Published run ids in the half-open interval [startDate, endDateExclusive).
 * Used to build the trend baseline for the preceding date-range period.
 */
async function getPublishedRunIdsBetween(
  db: DatabaseClient,
  seasonId: string | undefined,
  startDate: string,
  endDateExclusive: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: benchmarkRuns.id })
    .from(benchmarkRuns)
    .innerJoin(benchmarkSeasons, eq(benchmarkRuns.seasonId, benchmarkSeasons.id))
    .innerJoin(benchmarkProtocols, eq(benchmarkSeasons.protocolId, benchmarkProtocols.id))
    .where(
      and(
        seasonId ? eq(benchmarkRuns.seasonId, seasonId) : undefined,
        eq(benchmarkRuns.status, 'published'),
        eq(benchmarkProtocols.mode, 'benchmark'),
        gte(benchmarkRuns.scheduledFor, startDate),
        lt(benchmarkRuns.scheduledFor, endDateExclusive),
      ),
    )
    .orderBy(
      desc(benchmarkRuns.scheduledFor),
      desc(benchmarkSeasons.createdAt),
      desc(benchmarkRuns.id),
    )

  return rows.map((r) => r.id)
}

export async function getRunIdsForWindow(
  db: DatabaseClient,
  seasonId: string | undefined,
  windowType: WindowType,
  anchorDate: string,
): Promise<string[]> {
  const runIds = await getPublishedRunIds(db, seasonId, anchorDate)
  return sliceRunIdsForWindow(runIds, windowType)
}

type WeightConfig = {
  frontierWeight: number
  midWeight: number
  smallWeight: number
}

async function getWeightConfigsByRunIds(
  db: DatabaseClient,
  runIds: string[],
): Promise<Map<string, WeightConfig>> {
  if (runIds.length === 0) return new Map()

  const rows = await db
    .select({
      runId: benchmarkRuns.id,
      frontierWeight: benchmarkModelWeightConfigs.frontierWeight,
      midWeight: benchmarkModelWeightConfigs.midWeight,
      smallWeight: benchmarkModelWeightConfigs.smallWeight,
    })
    .from(benchmarkRuns)
    .innerJoin(
      benchmarkModelWeightConfigs,
      eq(benchmarkRuns.weightConfigId, benchmarkModelWeightConfigs.id),
    )
    .where(inArray(benchmarkRuns.id, runIds))

  const map = new Map<string, WeightConfig>()
  for (const row of rows) {
    map.set(row.runId, {
      frontierWeight: row.frontierWeight,
      midWeight: row.midWeight,
      smallWeight: row.smallWeight,
    })
  }
  return map
}

export type DecisionRow = {
  categoryId: string
  decisionType: 'tool' | 'none' | 'invalid'
  toolId: string | null
  runId: string
  modelSnapshotId: string
  modelName: string
  modelTier: 'frontier' | 'mid' | 'small'
  promptVersionId: string
  promptSlug: string
  promptLevel: PromptLevel
  toolName: string | null
  toolSlug: string | null
  toolLogoUrl: string | null
}

async function queryDecisions(
  db: DatabaseClient,
  runIds: string[],
  categoryIds: string[],
  filters: {
    promptLevel?: PromptLevel
    modelTier?: ModelTier
    modelSnapshotId?: string
    modelSnapshotIds?: string[]
    modelRangeId?: string
  },
): Promise<DecisionRow[]> {
  if (runIds.length === 0 || categoryIds.length === 0) return []

  const conditions = [
    inArray(benchmarkCaseDecisions.categoryId, categoryIds),
    inArray(benchmarkCaseResults.runId, runIds),
    eq(benchmarkCaseResults.status, 'completed'),
    eq(benchmarkCaseDecisions.resolutionStatus, 'resolved'),
    sql`${benchmarkCaseDecisions.decisionType} != 'invalid'`,
  ]

  if (filters.promptLevel) {
    conditions.push(eq(benchmarkPromptVersions.level, filters.promptLevel))
  }
  if (filters.modelTier) {
    conditions.push(eq(benchmarkModelSnapshots.tier, filters.modelTier))
  }
  if (filters.modelSnapshotId) {
    conditions.push(eq(benchmarkModelSnapshots.id, filters.modelSnapshotId))
  }

  if (filters.modelSnapshotIds) {
    conditions.push(inArray(benchmarkModelSnapshots.id, filters.modelSnapshotIds))
  }

  const rows = await db
    .select({
      categoryId: benchmarkCaseDecisions.categoryId,
      decisionType: benchmarkCaseDecisions.decisionType,
      toolId: benchmarkCaseDecisions.toolId,
      runId: benchmarkCaseResults.runId,
      modelSnapshotId: benchmarkCases.modelSnapshotId,
      modelName: benchmarkModelSnapshots.name,
      modelTier: benchmarkModelSnapshots.tier,
      promptVersionId: benchmarkCases.promptVersionId,
      promptSlug: benchmarkPromptVersions.slug,
      promptLevel: benchmarkPromptVersions.level,
      toolName: tools.name,
      toolSlug: tools.slug,
      toolLogoUrl: tools.logoUrl,
    })
    .from(benchmarkCaseDecisions)
    .innerJoin(
      benchmarkCaseResults,
      eq(benchmarkCaseDecisions.caseResultId, benchmarkCaseResults.id),
    )
    .innerJoin(benchmarkCases, eq(benchmarkCaseResults.caseId, benchmarkCases.id))
    .innerJoin(
      benchmarkModelSnapshots,
      eq(benchmarkCases.modelSnapshotId, benchmarkModelSnapshots.id),
    )
    .innerJoin(
      benchmarkPromptVersions,
      eq(benchmarkCases.promptVersionId, benchmarkPromptVersions.id),
    )
    .leftJoin(tools, eq(benchmarkCaseDecisions.toolId, tools.id))
    .where(and(...conditions))

  return rows as DecisionRow[]
}

// ---------------------------------------------------------------------------
// Batch-friendly helpers
// ---------------------------------------------------------------------------

export type ScoringContext = {
  runIds: string[]
  weightConfigs: Map<string, WeightConfig>
}

export async function prepareScoringContext(
  db: DatabaseClient,
  seasonId: string | undefined,
  windowType: WindowType,
  anchorDate: string,
  startDate?: string,
): Promise<ScoringContext> {
  const publishedRunIds = await getPublishedRunIds(db, seasonId, anchorDate, startDate)
  const runIds = sliceRunIdsForWindow(publishedRunIds, windowType)
  const weightConfigs =
    runIds.length > 0 ? await getWeightConfigsByRunIds(db, runIds) : new Map<string, WeightConfig>()
  return { runIds, weightConfigs }
}

export async function fetchDecisions(
  db: DatabaseClient,
  runIds: string[],
  categoryIds: string[],
  filters?: {
    promptLevel?: PromptLevel
    modelTier?: ModelTier
    modelSnapshotId?: string
    modelSnapshotIds?: string[]
    modelRangeId?: string
  },
): Promise<DecisionRow[]> {
  return queryDecisions(db, runIds, categoryIds, filters ?? {})
}

/**
 * Compute a category ranking from pre-fetched decisions.
 * Skips trend computation (trend is set to 0 for all items).
 */
export function rankFromDecisions(
  decisions: DecisionRow[],
  weightConfigs: Map<string, WeightConfig>,
  resultCategoryId: string,
  windowType: WindowType,
  anchorDate: string,
): CategoryRankingResult {
  const defaultWeight: WeightConfig = { frontierWeight: 1, midWeight: 1, smallWeight: 1 }
  const allModels = new Set<string>()
  const allPrompts = new Set<string>()
  let totalEligible = 0
  let totalWeightedEligible = 0

  type ToolAgg = {
    toolId: string
    toolName: string
    toolSlug: string
    toolLogoUrl: string | null
    rawSupport: number
    weightedSupport: number
    models: Set<string>
    prompts: Set<string>
  }
  const toolAggs = new Map<string, ToolAgg>()

  for (const d of decisions) {
    const wc = weightConfigs.get(d.runId) ?? defaultWeight
    const weight = getWeightForTier(wc, d.modelTier)
    allModels.add(d.modelSnapshotId)
    allPrompts.add(d.promptVersionId)
    totalEligible++
    totalWeightedEligible += weight

    if (d.decisionType === 'tool' && d.toolId) {
      let agg = toolAggs.get(d.toolId)
      if (!agg) {
        agg = {
          toolId: d.toolId,
          toolName: d.toolName ?? 'Unknown',
          toolSlug: d.toolSlug ?? 'unknown',
          toolLogoUrl: d.toolLogoUrl,
          rawSupport: 0,
          weightedSupport: 0,
          models: new Set(),
          prompts: new Set(),
        }
        toolAggs.set(d.toolId, agg)
      }
      agg.rawSupport++
      agg.weightedSupport += weight
      agg.models.add(d.modelSnapshotId)
      agg.prompts.add(d.promptVersionId)
    }
  }

  const totalDistinctModels = allModels.size
  const totalDistinctPrompts = allPrompts.size
  const meetsThreshold =
    totalEligible >= 100 && totalDistinctModels >= 3 && totalDistinctPrompts >= 3

  const items: ToolRankingEntry[] = Array.from(toolAggs.values()).map((agg) => {
    const weightedSupportRate =
      totalWeightedEligible > 0 ? agg.weightedSupport / totalWeightedEligible : 0
    const rawSupportRate = totalEligible > 0 ? agg.rawSupport / totalEligible : 0
    const ci = wilsonInterval(agg.rawSupport, totalEligible)
    return {
      toolId: agg.toolId,
      toolName: agg.toolName,
      toolSlug: agg.toolSlug,
      toolLogoUrl: agg.toolLogoUrl,
      weightedSupport: agg.weightedSupport,
      weightedEligible: totalWeightedEligible,
      weightedSupportRate,
      rawSupportCount: agg.rawSupport,
      rawEligibleCount: totalEligible,
      rawSupportRate,
      modelCoverage: totalDistinctModels > 0 ? agg.models.size / totalDistinctModels : 0,
      promptCoverage: totalDistinctPrompts > 0 ? agg.prompts.size / totalDistinctPrompts : 0,
      ciLow: ci.low,
      ciHigh: ci.high,
      trend: 0,
    }
  })

  items.sort(
    (a, b) =>
      b.weightedSupportRate - a.weightedSupportRate ||
      b.ciLow - a.ciLow ||
      b.rawSupportCount - a.rawSupportCount ||
      a.toolName.localeCompare(b.toolName) ||
      a.toolId.localeCompare(b.toolId),
  )

  return {
    categoryId: resultCategoryId,
    windowType,
    anchorDate,
    items,
    totalEligibleDecisions: totalEligible,
    totalDistinctModels,
    totalDistinctPrompts,
    meetsPublicationThreshold: meetsThreshold,
  }
}

/**
 * Compute a head-to-head result from pre-fetched decisions.
 */
export function headToHeadFromDecisions(
  decisions: DecisionRow[],
  weightConfigs: Map<string, WeightConfig>,
  toolAId: string,
  toolBId: string,
  categoryId: string,
): HeadToHeadResult {
  const empty: HeadToHeadResult = {
    toolAId,
    toolBId,
    categoryId,
    aWins: 0,
    bWins: 0,
    abstains: 0,
    otherToolCount: 0,
    decisiveCaseCount: 0,
    aWinRate: 0,
    bWinRate: 0,
    ciLow: 0,
    ciHigh: 0,
    weightedAWins: 0,
    weightedBWins: 0,
    weightedAWinRate: 0,
    modelBreakdown: [],
    promptBreakdown: [],
    meetsPublicationThreshold: false,
  }

  if (toolAId === toolBId) return empty
  if (decisions.length === 0) return empty

  const defaultWeight: WeightConfig = { frontierWeight: 1, midWeight: 1, smallWeight: 1 }
  const h2hFilters = { toolAId, toolBId }

  let aWins = 0
  let bWins = 0
  let abstains = 0
  let otherToolCount = 0
  let weightedAWins = 0
  let weightedBWins = 0
  const modelBreakdownMap = new Map<string, HeadToHeadBreakdownEntry>()
  const promptBreakdownMap = new Map<string, HeadToHeadBreakdownEntry>()

  for (const d of decisions) {
    const wc = weightConfigs.get(d.runId) ?? defaultWeight
    const weight = getWeightForTier(wc, d.modelTier)
    const outcome = classifyHeadToHeadDecision(d, h2hFilters)

    if (outcome === 'a') {
      aWins++
      weightedAWins += weight
    } else if (outcome === 'b') {
      bWins++
      weightedBWins += weight
    } else if (outcome === 'none') {
      abstains++
    } else {
      otherToolCount++
    }

    applyBreakdownOutcome(
      getBreakdownEntry(modelBreakdownMap, {
        id: d.modelSnapshotId,
        label: d.modelName,
        tier: d.modelTier,
      }),
      outcome,
    )
    applyBreakdownOutcome(
      getBreakdownEntry(promptBreakdownMap, {
        id: d.promptVersionId,
        label: d.promptSlug,
        tier: d.promptLevel,
      }),
      outcome,
    )
  }

  const decisiveCaseCount = aWins + bWins
  const aWinRate = decisiveCaseCount > 0 ? aWins / decisiveCaseCount : 0
  const bWinRate = decisiveCaseCount > 0 ? bWins / decisiveCaseCount : 0
  const ci = wilsonInterval(aWins, decisiveCaseCount)
  const weightedDecisive = weightedAWins + weightedBWins
  const weightedAWinRate = weightedDecisive > 0 ? weightedAWins / weightedDecisive : 0

  return {
    toolAId,
    toolBId,
    categoryId,
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
    modelBreakdown: finalizeBreakdown(modelBreakdownMap),
    promptBreakdown: finalizeBreakdown(promptBreakdownMap),
    meetsPublicationThreshold: decisiveCaseCount >= 30,
  }
}

// ---------------------------------------------------------------------------
// Category ranking
// ---------------------------------------------------------------------------

export async function computeCategoryRanking(
  db: DatabaseClient,
  filters: ScoringFilters,
): Promise<CategoryRankingResult> {
  return computeRankingForCategoryIds(db, {
    categoryIds: [filters.categoryId],
    resultCategoryId: filters.categoryId,
    seasonId: filters.seasonId,
    windowType: filters.windowType,
    anchorDate: filters.anchorDate,
    promptLevel: filters.promptLevel,
    modelTier: filters.modelTier,
    modelSnapshotId: filters.modelSnapshotId,
    modelSnapshotIds: filters.modelSnapshotIds,
    modelRangeId: filters.modelRangeId,
    startDate: filters.startDate,
    previousStartDate: filters.previousStartDate,
  })
}

export async function computeCategoryGroupRanking(
  db: DatabaseClient,
  filters: RankingFilters & {
    categoryGroupId: string
    categoryIds: string[]
  },
): Promise<CategoryRankingResult> {
  return computeRankingForCategoryIds(db, {
    categoryIds: filters.categoryIds,
    resultCategoryId: filters.categoryGroupId,
    seasonId: filters.seasonId,
    windowType: filters.windowType,
    anchorDate: filters.anchorDate,
    promptLevel: filters.promptLevel,
    modelTier: filters.modelTier,
    modelSnapshotId: filters.modelSnapshotId,
    modelSnapshotIds: filters.modelSnapshotIds,
    modelRangeId: filters.modelRangeId,
    startDate: filters.startDate,
    previousStartDate: filters.previousStartDate,
  })
}

type RankingTool = Pick<typeof tools.$inferSelect, 'id' | 'name' | 'slug' | 'logoUrl'>

async function loadRankingTools(db: DatabaseClient, rows: RankingAggregate[]) {
  const ids = [...new Set(rows.flatMap((row) => (row.toolId ? [row.toolId] : [])))]
  const toolRows = ids.length
    ? await db
        .select({
          id: tools.id,
          name: tools.name,
          slug: tools.slug,
          logoUrl: tools.logoUrl,
        })
        .from(tools)
        .where(inArray(tools.id, ids))
    : []
  return new Map(toolRows.map((tool) => [tool.id, tool]))
}

function rankingFromAggregates(
  rows: RankingAggregate[],
  toolDetails: Map<string, RankingTool>,
  categoryId: string,
  filters: RankingFilters,
  previous: RankingAggregate[] = [],
): CategoryRankingResult {
  const total = rows.find((row) => row.isTotal === 1)
  const totalEligible = total?.count ?? 0
  const totalWeighted = total?.weight ?? 0
  const totalModels = total?.models ?? 0
  const totalPrompts = total?.prompts ?? 0
  const previousWeight = previous.find((row) => row.isTotal === 1)?.weight ?? 0
  const previousTools = new Map(
    previous.filter((row) => row.toolId).map((row) => [row.toolId, row.weight]),
  )
  const items = rows.flatMap((row): ToolRankingEntry[] => {
    if (!row.toolId || row.isTotal) return []
    const tool = toolDetails.get(row.toolId)
    const rate = totalWeighted > 0 ? row.weight / totalWeighted : 0
    const ci = wilsonInterval(row.count, totalEligible)
    return [
      {
        toolId: row.toolId,
        toolName: tool?.name ?? 'Unknown',
        toolSlug: tool?.slug ?? 'unknown',
        toolLogoUrl: tool?.logoUrl ?? null,
        weightedSupport: row.weight,
        weightedEligible: totalWeighted,
        weightedSupportRate: rate,
        rawSupportCount: row.count,
        rawEligibleCount: totalEligible,
        rawSupportRate: totalEligible > 0 ? row.count / totalEligible : 0,
        modelCoverage: totalModels > 0 ? row.models / totalModels : 0,
        promptCoverage: totalPrompts > 0 ? row.prompts / totalPrompts : 0,
        ciLow: ci.low,
        ciHigh: ci.high,
        trend:
          previousWeight > 0 ? rate - (previousTools.get(row.toolId) ?? 0) / previousWeight : 0,
      },
    ]
  })
  items.sort(
    (a, b) =>
      b.weightedSupportRate - a.weightedSupportRate ||
      b.ciLow - a.ciLow ||
      b.rawSupportCount - a.rawSupportCount ||
      a.toolName.localeCompare(b.toolName) ||
      a.toolId.localeCompare(b.toolId),
  )
  return {
    categoryId,
    windowType: filters.windowType,
    anchorDate: filters.anchorDate,
    items,
    totalEligibleDecisions: totalEligible,
    totalDistinctModels: totalModels,
    totalDistinctPrompts: totalPrompts,
    meetsPublicationThreshold: totalEligible >= 100 && totalModels >= 3 && totalPrompts >= 3,
  }
}

/** Batched category previews, without a trend baseline, matching rankFromDecisions. */
export async function computeCategoryRankings(
  db: DatabaseClient,
  filters: RankingFilters & { categoryIds: string[] },
): Promise<CategoryRankingResult[]> {
  return cachedPublicScoring(db, 'categories', filters, async () => {
    const publishedRunIds = await getPublishedRunIds(
      db,
      filters.seasonId,
      filters.anchorDate,
      filters.startDate,
    )
    const runIds = sliceRunIdsForWindow(publishedRunIds, filters.windowType)
    const rows = await queryRankingAggregates(db, runIds, filters.categoryIds, filters, true)
    const toolDetails = await loadRankingTools(db, rows)
    return filters.categoryIds.map((id) =>
      rankingFromAggregates(
        rows.filter((row) => row.categoryId === id),
        toolDetails,
        id,
        filters,
      ),
    )
  })
}

async function computeRankingForCategoryIds(
  db: DatabaseClient,
  filters: RankingFilters & { categoryIds: string[]; resultCategoryId: string },
): Promise<CategoryRankingResult> {
  return cachedPublicScoring(db, 'ranking', filters, async () => {
    const publishedRunIds = await getPublishedRunIds(
      db,
      filters.seasonId,
      filters.anchorDate,
      filters.startDate,
    )
    const runIds = sliceRunIdsForWindow(publishedRunIds, filters.windowType)
    const previousRunIds =
      filters.previousStartDate && filters.startDate
        ? await getPublishedRunIdsBetween(
            db,
            filters.seasonId,
            filters.previousStartDate,
            filters.startDate,
          )
        : filters.windowType === 'season_to_date'
          ? []
          : sliceRunIdsForWindow(publishedRunIds, filters.windowType, runIds.length)
    const rows = await queryRankingAggregates(db, runIds, filters.categoryIds, filters, false)
    const previous = await queryRankingAggregates(
      db,
      previousRunIds,
      filters.categoryIds,
      filters,
      false,
    )
    const toolDetails = await loadRankingTools(db, rows)
    return rankingFromAggregates(rows, toolDetails, filters.resultCategoryId, filters, previous)
  })
}

// ---------------------------------------------------------------------------
// Head-to-head
// ---------------------------------------------------------------------------

export async function computeHeadToHead(
  db: DatabaseClient,
  filters: HeadToHeadFilters,
): Promise<HeadToHeadResult> {
  return cachedPublicScoring(db, 'head-to-head', filters, async () => {
    const empty = headToHeadFromDecisions(
      [],
      new Map(),
      filters.toolAId,
      filters.toolBId,
      filters.categoryId,
    )
    if (filters.toolAId === filters.toolBId) return empty
    const runIds = await getRunIdsForWindow(
      db,
      filters.seasonId,
      filters.windowType,
      filters.anchorDate,
    )
    const rows = await queryHeadToHeadAggregates(db, runIds, filters)
    const total = rows.find((row) => row.modelId === null && row.promptId === null)
    if (!total) return empty

    const models = new Map<string, HeadToHeadBreakdownEntry>()
    const prompts = new Map<string, HeadToHeadBreakdownEntry>()
    for (const row of rows) {
      const counts = {
        aWins: row.aWins,
        bWins: row.bWins,
        abstains: row.abstains,
        otherToolCount: row.otherToolCount,
        decisiveCaseCount: 0,
        aWinRate: 0,
      }
      if (row.modelId && row.modelName !== null && row.modelTier) {
        models.set(row.modelId, {
          ...counts,
          id: row.modelId,
          label: row.modelName,
          tier: row.modelTier,
        })
      }
      if (row.promptId && row.promptSlug !== null && row.promptLevel) {
        prompts.set(row.promptId, {
          ...counts,
          id: row.promptId,
          label: row.promptSlug,
          tier: row.promptLevel,
        })
      }
    }
    const decisiveCaseCount = total.aWins + total.bWins
    const weightedDecisive = total.weightedAWins + total.weightedBWins
    const ci = wilsonInterval(total.aWins, decisiveCaseCount)
    return {
      ...empty,
      aWins: total.aWins,
      bWins: total.bWins,
      abstains: total.abstains,
      otherToolCount: total.otherToolCount,
      decisiveCaseCount,
      aWinRate: decisiveCaseCount > 0 ? total.aWins / decisiveCaseCount : 0,
      bWinRate: decisiveCaseCount > 0 ? total.bWins / decisiveCaseCount : 0,
      ciLow: ci.low,
      ciHigh: ci.high,
      weightedAWins: total.weightedAWins,
      weightedBWins: total.weightedBWins,
      weightedAWinRate: weightedDecisive > 0 ? total.weightedAWins / weightedDecisive : 0,
      modelBreakdown: finalizeBreakdown(models),
      promptBreakdown: finalizeBreakdown(prompts),
      meetsPublicationThreshold: decisiveCaseCount >= 30,
    }
  })
}

/**
 * Head-to-head totals from a ranking over the same runs and filters, so listings skip
 * one decision scan per pair. Model and prompt breakdowns still need computeHeadToHead.
 */
export function headToHeadFromRanking(
  ranking: CategoryRankingResult,
  toolAId: string,
  toolBId: string,
): HeadToHeadResult {
  const empty = headToHeadFromDecisions([], new Map(), toolAId, toolBId, ranking.categoryId)
  if (toolAId === toolBId) return empty

  const toolA = ranking.items.find((item) => item.toolId === toolAId)
  const toolB = ranking.items.find((item) => item.toolId === toolBId)
  const aWins = toolA?.rawSupportCount ?? 0
  const bWins = toolB?.rawSupportCount ?? 0
  const toolDecisions = ranking.items.reduce((sum, item) => sum + item.rawSupportCount, 0)
  const weightedAWins = toolA?.weightedSupport ?? 0
  const weightedBWins = toolB?.weightedSupport ?? 0
  const decisiveCaseCount = aWins + bWins
  const weightedDecisive = weightedAWins + weightedBWins
  const ci = wilsonInterval(aWins, decisiveCaseCount)
  return {
    ...empty,
    aWins,
    bWins,
    abstains: ranking.totalEligibleDecisions - toolDecisions,
    otherToolCount: toolDecisions - decisiveCaseCount,
    decisiveCaseCount,
    aWinRate: decisiveCaseCount > 0 ? aWins / decisiveCaseCount : 0,
    bWinRate: decisiveCaseCount > 0 ? bWins / decisiveCaseCount : 0,
    ciLow: ci.low,
    ciHigh: ci.high,
    weightedAWins,
    weightedBWins,
    weightedAWinRate: weightedDecisive > 0 ? weightedAWins / weightedDecisive : 0,
    meetsPublicationThreshold: decisiveCaseCount >= 30,
  }
}

type HeadToHeadOutcome = 'a' | 'b' | 'none' | 'other'

function classifyHeadToHeadDecision(
  decision: DecisionRow,
  filters: Pick<HeadToHeadFilters, 'toolAId' | 'toolBId'>,
): HeadToHeadOutcome {
  if (decision.decisionType === 'tool' && decision.toolId === filters.toolAId) return 'a'
  if (decision.decisionType === 'tool' && decision.toolId === filters.toolBId) return 'b'
  if (decision.decisionType === 'none') return 'none'
  return 'other'
}

function getBreakdownEntry(
  entries: Map<string, HeadToHeadBreakdownEntry>,
  seed: Pick<HeadToHeadBreakdownEntry, 'id' | 'label' | 'tier'>,
) {
  let entry = entries.get(seed.id)
  if (!entry) {
    entry = {
      ...seed,
      aWins: 0,
      bWins: 0,
      abstains: 0,
      otherToolCount: 0,
      decisiveCaseCount: 0,
      aWinRate: 0,
    }
    entries.set(seed.id, entry)
  }
  return entry
}

function applyBreakdownOutcome(entry: HeadToHeadBreakdownEntry, outcome: HeadToHeadOutcome) {
  if (outcome === 'a') {
    entry.aWins++
    return
  }
  if (outcome === 'b') {
    entry.bWins++
    return
  }
  if (outcome === 'none') {
    entry.abstains++
    return
  }
  entry.otherToolCount++
}

function finalizeBreakdown(entries: Map<string, HeadToHeadBreakdownEntry>) {
  return Array.from(entries.values())
    .map((entry) => {
      const decisiveCaseCount = entry.aWins + entry.bWins
      return {
        ...entry,
        decisiveCaseCount,
        aWinRate: decisiveCaseCount > 0 ? entry.aWins / decisiveCaseCount : 0,
      }
    })
    .sort(
      (a, b) =>
        b.decisiveCaseCount - a.decisiveCaseCount ||
        b.aWins - a.aWins ||
        a.label.localeCompare(b.label),
    )
}
