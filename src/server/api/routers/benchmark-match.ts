import { TRPCError } from '@trpc/server'
import { and, asc, desc, eq, gte, inArray, lt, or, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { serverSettings } from '~/constants/server-settings'
import {
  anchorDateSchema,
  findAllBenchmarkSeasonIds,
  findBenchmarkSeasonId,
  findLatestPublishedBenchmarkSeasonId,
  findPublicManualBenchmarkSeasonIds,
} from '~/server/api/helpers/benchmark'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import type { db as DatabaseInstance } from '~/server/db'
import {
  categories,
  matchBatches,
  matchEvaluations,
  subcategories,
  tools,
} from '~/server/db/schema'
import {
  computeHeadToHead,
  type DecisionRow,
  fetchDecisions,
  type HeadToHeadBreakdownEntry,
  type HeadToHeadResult,
  headToHeadFromDecisions,
  type ModelTier,
  prepareScoringContext,
  rankFromDecisions,
  type WindowType,
  wilsonInterval,
} from '~/server/llm/benchmark/scoring'
import { type PromptLevel, promptLevelSchema } from '~/server/llm/prompts'

type MatchupEntry = {
  category: { id: string; name: string; slug: string }
  toolA: { id: string; name: string; slug: string; logoUrl: string | null }
  toolB: { id: string; name: string; slug: string; logoUrl: string | null }
  result: HeadToHeadResult
  status: 'active' | 'historical'
}

function matchupKey(categoryId: string, toolAId: string, toolBId: string) {
  return [categoryId, toolAId < toolBId ? toolAId : toolBId, toolAId < toolBId ? toolBId : toolAId]
    .join(':')
    .toLowerCase()
}

type ManualHeadToHeadScope = {
  seasonId?: string
  seasonIds?: string[]
  windowType?: WindowType
  anchorDate?: string
  promptLevel?: PromptLevel
  modelTier?: ModelTier
}

type ManualHeadToHeadBatch = {
  toolAId: string
  toolBId: string
  evaluations: Array<{
    modelSnapshotId: string
    winnerDecision: (typeof matchEvaluations.$inferSelect)['winnerDecision']
    modelSnapshot: {
      name: string
      tier: ModelTier
    }
  }>
}

function addDaysUtc(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function getManualWindowBounds(windowType: WindowType, anchorDate: string) {
  const dayStart = new Date(`${anchorDate}T00:00:00.000Z`)
  const dayEndExclusive = addDaysUtc(dayStart, 1)

  switch (windowType) {
    case 'run_day':
      return { startInclusive: dayStart, endExclusive: dayEndExclusive }
    case 'trailing_7d':
      return { startInclusive: addDaysUtc(dayStart, -6), endExclusive: dayEndExclusive }
    case 'trailing_28d':
      return { startInclusive: addDaysUtc(dayStart, -27), endExclusive: dayEndExclusive }
    case 'season_to_date':
      return { startInclusive: null, endExclusive: dayEndExclusive }
  }
}

function buildHeadToHeadFromManualBatches(args: {
  batches: ManualHeadToHeadBatch[]
  categoryId: string
  toolAId: string
  toolBId: string
  modelTier?: ModelTier
}): HeadToHeadResult | null {
  const { batches, categoryId, toolAId, toolBId, modelTier } = args
  if (batches.length === 0) return null

  let aWins = 0
  let bWins = 0
  let abstains = 0
  const modelBreakdownMap = new Map<string, HeadToHeadBreakdownEntry>()

  for (const batch of batches) {
    const flipped = batch.toolAId !== toolAId
    for (const ev of batch.evaluations) {
      const tier = ev.modelSnapshot.tier as ModelTier
      if (modelTier && tier !== modelTier) continue

      const decision = ev.winnerDecision
      const isA = flipped ? decision === 'tool_b' : decision === 'tool_a'
      const isB = flipped ? decision === 'tool_a' : decision === 'tool_b'

      if (isA) aWins++
      else if (isB) bWins++
      else abstains++

      const msId = ev.modelSnapshotId
      let entry = modelBreakdownMap.get(msId)
      if (!entry) {
        entry = {
          id: msId,
          label: ev.modelSnapshot.name,
          tier,
          aWins: 0,
          bWins: 0,
          abstains: 0,
          otherToolCount: 0,
          decisiveCaseCount: 0,
          aWinRate: 0,
        }
        modelBreakdownMap.set(msId, entry)
      }
      if (isA) {
        entry.aWins++
        entry.decisiveCaseCount++
      } else if (isB) {
        entry.bWins++
        entry.decisiveCaseCount++
      } else entry.abstains++
    }
  }

  const decisiveCaseCount = aWins + bWins
  if (decisiveCaseCount === 0) return null

  const aWinRate = aWins / decisiveCaseCount
  const bWinRate = bWins / decisiveCaseCount
  const ci = wilsonInterval(aWins, decisiveCaseCount)

  return {
    toolAId,
    toolBId,
    categoryId,
    aWins,
    bWins,
    abstains,
    otherToolCount: 0,
    decisiveCaseCount,
    aWinRate,
    bWinRate,
    ciLow: ci.low,
    ciHigh: ci.high,
    weightedAWins: aWins,
    weightedBWins: bWins,
    weightedAWinRate: aWinRate,
    modelBreakdown: Array.from(modelBreakdownMap.values()).map((entry) => ({
      ...entry,
      aWinRate: entry.decisiveCaseCount > 0 ? entry.aWins / entry.decisiveCaseCount : 0,
    })),
    promptBreakdown: [],
    meetsPublicationThreshold: decisiveCaseCount >= 30,
  }
}

async function buildManualHeadToHead(
  database: typeof DatabaseInstance,
  categoryId: string,
  toolAId: string,
  toolBId: string,
  scope?: ManualHeadToHeadScope,
): Promise<HeadToHeadResult | null> {
  // Manual batches do not carry prompt-level metadata, so promptLevel-scoped
  // requests should not return unscoped manual fallback results.
  if (scope?.promptLevel) return null
  const eligibleSeasonIds =
    scope?.seasonIds ??
    (scope?.seasonId ? [scope.seasonId] : await findAllBenchmarkSeasonIds(database))
  if (eligibleSeasonIds.length === 0) return null

  const conditions = [
    eq(matchBatches.triggerMode, 'manual'),
    eq(matchBatches.status, 'completed'),
    eq(matchBatches.categoryId, categoryId),
    or(
      and(eq(matchBatches.toolAId, toolAId), eq(matchBatches.toolBId, toolBId)),
      and(eq(matchBatches.toolAId, toolBId), eq(matchBatches.toolBId, toolAId)),
    ),
    inArray(matchBatches.seasonId, eligibleSeasonIds),
  ]

  if (scope?.anchorDate) {
    const bounds = getManualWindowBounds(scope.windowType ?? 'trailing_28d', scope.anchorDate)
    conditions.push(lt(matchBatches.createdAt, bounds.endExclusive))
    if (bounds.startInclusive) {
      conditions.push(gte(matchBatches.createdAt, bounds.startInclusive))
    }
  }

  const batches = await database.query.matchBatches.findMany({
    where: and(...conditions),
    orderBy: [desc(matchBatches.createdAt)],
    with: {
      evaluations: {
        where: eq(matchEvaluations.status, 'completed'),
        with: { modelSnapshot: true },
      },
    },
  })

  return buildHeadToHeadFromManualBatches({
    batches,
    categoryId,
    toolAId,
    toolBId,
    modelTier: scope?.modelTier,
  })
}

type ManualCollectMode = 'within' | 'before'

/**
 * Scans completed manual match batches for distinct tool pairs and appends
 * head-to-head matchup entries to `matchups`.
 *
 * - `mode: 'within'` collects pairs whose batches fall inside the trailing
 *   window `[windowStartInclusive, windowEndExclusive)` (active matchups).
 * - `mode: 'before'` collects pairs whose batches are older than
 *   `windowStartInclusive` (historical matchups), skipping any pair already
 *   present in `seenKeys` so active pairs are not duplicated.
 *
 * Pairs are scanned in reverse-chronological order and de-duplicated via
 * `seenKeys`, which is mutated alongside `matchups`.
 */
async function collectManualMatchups(args: {
  db: typeof DatabaseInstance
  eligibleManualSeasonIds: string[]
  scopedSubcategoryIds: string[] | null
  windowEndExclusive: Date
  windowStartInclusive: Date | null
  mode: ManualCollectMode
  seenKeys: Set<string>
  matchups: MatchupEntry[]
  status: 'active' | 'historical'
  cap: number
}): Promise<void> {
  const {
    db,
    eligibleManualSeasonIds,
    scopedSubcategoryIds,
    windowEndExclusive,
    windowStartInclusive,
    mode,
    seenKeys,
    matchups,
    status,
    cap,
  } = args

  if (scopedSubcategoryIds && scopedSubcategoryIds.length === 0) return
  if (eligibleManualSeasonIds.length === 0) return
  if (mode === 'before' && !windowStartInclusive) return

  const windowConditions: Array<SQL | undefined> = [
    lt(matchBatches.createdAt, windowEndExclusive),
    mode === 'within'
      ? windowStartInclusive
        ? gte(matchBatches.createdAt, windowStartInclusive)
        : undefined
      : lt(matchBatches.createdAt, windowStartInclusive as Date),
  ]

  const baseConditions: Array<SQL | undefined> = [
    eq(matchBatches.triggerMode, 'manual'),
    eq(matchBatches.status, 'completed'),
    inArray(matchBatches.seasonId, eligibleManualSeasonIds),
    ...windowConditions,
    scopedSubcategoryIds ? inArray(matchBatches.categoryId, scopedSubcategoryIds) : undefined,
  ]

  const scanPageSize = Math.min(
    serverSettings.benchmark.featuredMatchups.manualPairScanMaxRows,
    Math.max(cap, cap * serverSettings.benchmark.featuredMatchups.manualPairScanMultiplier),
  )

  const attemptedPairKeys = new Set<string>()
  let scanBeforeCreatedAt: Date | null = null
  let scanBeforeId: string | null = null

  while (matchups.length < cap) {
    const whereClause =
      scanBeforeCreatedAt && scanBeforeId
        ? and(
            ...baseConditions,
            or(
              lt(matchBatches.createdAt, scanBeforeCreatedAt),
              and(
                eq(matchBatches.createdAt, scanBeforeCreatedAt),
                lt(matchBatches.id, scanBeforeId),
              ),
            ),
          )
        : and(...baseConditions)

    const manualPairRows: Array<{
      id: string
      createdAt: Date
      categoryId: string
      toolAId: string
      toolBId: string
    }> = await db.query.matchBatches.findMany({
      where: whereClause,
      columns: {
        id: true,
        createdAt: true,
        categoryId: true,
        toolAId: true,
        toolBId: true,
      },
      orderBy: [desc(matchBatches.createdAt), desc(matchBatches.id)],
      limit: scanPageSize,
    })

    if (manualPairRows.length === 0) break

    const lastRow = manualPairRows[manualPairRows.length - 1]
    if (!lastRow) break
    scanBeforeCreatedAt = lastRow.createdAt
    scanBeforeId = lastRow.id

    const selectedPairs: Array<{ categoryId: string; toolAId: string; toolBId: string }> = []
    const selectedPairKeys = new Set<string>()
    for (const row of manualPairRows) {
      const key = matchupKey(row.categoryId, row.toolAId, row.toolBId)
      if (seenKeys.has(key) || attemptedPairKeys.has(key) || selectedPairKeys.has(key)) continue

      selectedPairKeys.add(key)
      attemptedPairKeys.add(key)
      selectedPairs.push({
        categoryId: row.categoryId,
        toolAId: row.toolAId,
        toolBId: row.toolBId,
      })
    }

    if (selectedPairs.length === 0) continue

    const selectedPairConditions = selectedPairs.map((pair) =>
      and(
        eq(matchBatches.categoryId, pair.categoryId),
        or(
          and(eq(matchBatches.toolAId, pair.toolAId), eq(matchBatches.toolBId, pair.toolBId)),
          and(eq(matchBatches.toolAId, pair.toolBId), eq(matchBatches.toolBId, pair.toolAId)),
        ),
      ),
    )

    const manualBatches = await db.query.matchBatches.findMany({
      where: and(and(...baseConditions), or(...selectedPairConditions)),
      orderBy: [desc(matchBatches.createdAt)],
      with: {
        category: true,
        toolA: true,
        toolB: true,
        evaluations: {
          where: eq(matchEvaluations.status, 'completed'),
          with: { modelSnapshot: true },
        },
      },
    })

    type ManualBatch = (typeof manualBatches)[number]
    const groupedBatchesByKey = new Map<
      string,
      {
        representative: ManualBatch
        batches: ManualBatch[]
      }
    >()

    for (const batch of manualBatches) {
      const key = matchupKey(batch.categoryId, batch.toolAId, batch.toolBId)
      let grouped = groupedBatchesByKey.get(key)
      if (!grouped) {
        grouped = { representative: batch, batches: [] }
        groupedBatchesByKey.set(key, grouped)
      }
      grouped.batches.push(batch)
    }

    for (const [key, grouped] of groupedBatchesByKey) {
      if (matchups.length >= cap) break
      if (seenKeys.has(key)) continue

      const { representative, batches } = grouped
      const result = buildHeadToHeadFromManualBatches({
        batches,
        categoryId: representative.categoryId,
        toolAId: representative.toolAId,
        toolBId: representative.toolBId,
      })
      if (!result) continue

      seenKeys.add(key)

      matchups.push({
        category: representative.category,
        toolA: {
          id: representative.toolA.id,
          name: representative.toolA.name,
          slug: representative.toolA.slug,
          logoUrl: representative.toolA.logoUrl,
        },
        toolB: {
          id: representative.toolB.id,
          name: representative.toolB.name,
          slug: representative.toolB.slug,
          logoUrl: representative.toolB.logoUrl,
        },
        result,
        status,
      })
    }
  }
}

/**
 * Returns a head-to-head result, falling back to a `season_to_date` manual
 * aggregate when the primary result has no decisive cases. This lets the match
 * detail page surface historical data for pairs that no longer have activity
 * within the requested trailing window.
 */
async function resolveHeadToHeadWithHistoricalFallback(
  database: typeof DatabaseInstance,
  args: {
    categoryId: string
    toolAId: string
    toolBId: string
    seasonIds: string[]
    primary: HeadToHeadResult | null
    promptLevel?: PromptLevel
    modelTier?: ModelTier
  },
): Promise<HeadToHeadResult | null> {
  if (args.primary && args.primary.decisiveCaseCount > 0) return args.primary
  if (args.seasonIds.length === 0) return args.primary

  const historical = await buildManualHeadToHead(
    database,
    args.categoryId,
    args.toolAId,
    args.toolBId,
    {
      seasonIds: args.seasonIds,
      windowType: 'season_to_date',
      promptLevel: args.promptLevel,
      modelTier: args.modelTier,
    },
  )

  return historical && historical.decisiveCaseCount > 0 ? historical : args.primary
}

export const benchmarkMatchRouter = createTRPCRouter({
  headToHead: publicProcedure
    .input(
      z
        .object({
          categorySlug: z.string().min(1).max(100),
          toolASlug: z.string().min(1).max(255),
          toolBSlug: z.string().min(1).max(255),
          seasonId: z.string().uuid().optional(),
          windowType: z
            .enum(['run_day', 'trailing_7d', 'trailing_28d', 'season_to_date'])
            .default('trailing_28d'),
          anchorDate: anchorDateSchema.optional(),
          promptLevel: promptLevelSchema.optional(),
          modelTier: z.enum(['frontier', 'mid', 'small']).optional(),
        })
        .refine((input) => input.toolASlug !== input.toolBSlug, {
          message: 'toolASlug and toolBSlug must be different',
          path: ['toolBSlug'],
        }),
    )
    .query(async ({ ctx, input }) => {
      const hasExplicitSeasonId = input.seasonId !== undefined
      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)
      const [category, toolA, toolB] = await Promise.all([
        ctx.db.query.subcategories.findFirst({
          where: eq(subcategories.slug, input.categorySlug),
        }),
        ctx.db.query.tools.findFirst({
          where: eq(tools.slug, input.toolASlug),
        }),
        ctx.db.query.tools.findFirst({
          where: eq(tools.slug, input.toolBSlug),
        }),
      ])

      if (!category || !toolA || !toolB) {
        return {
          category: category ?? null,
          toolA: toolA ?? null,
          toolB: toolB ?? null,
          result: null,
        }
      }

      let seasonId = input.seasonId
      if (seasonId) {
        const benchmarkSeasonId = await findBenchmarkSeasonId(ctx.db, seasonId)
        if (!benchmarkSeasonId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'seasonId must reference a benchmark season',
          })
        }
        seasonId = benchmarkSeasonId
      } else {
        const defaultSeasonId = await findLatestPublishedBenchmarkSeasonId(ctx.db, anchorDate)
        if (!defaultSeasonId) {
          const manualSeasonIds = await findPublicManualBenchmarkSeasonIds(ctx.db, anchorDate)
          const manualResult = await buildManualHeadToHead(
            ctx.db,
            category.id,
            toolA.id,
            toolB.id,
            {
              seasonIds: manualSeasonIds,
              windowType: input.windowType,
              anchorDate,
              promptLevel: input.promptLevel,
              modelTier: input.modelTier,
            },
          )
          const result = await resolveHeadToHeadWithHistoricalFallback(ctx.db, {
            categoryId: category.id,
            toolAId: toolA.id,
            toolBId: toolB.id,
            seasonIds: manualSeasonIds,
            primary: manualResult,
            promptLevel: input.promptLevel,
            modelTier: input.modelTier,
          })
          return { category, toolA, toolB, result }
        }
        seasonId = defaultSeasonId
      }

      const benchmarkResult = await computeHeadToHead(ctx.db, {
        categoryId: category.id,
        seasonId,
        toolAId: toolA.id,
        toolBId: toolB.id,
        windowType: input.windowType,
        anchorDate,
        promptLevel: input.promptLevel,
        modelTier: input.modelTier,
      })

      // If benchmark data has decisive cases, use it
      if (benchmarkResult.decisiveCaseCount > 0) {
        return { category, toolA, toolB, result: benchmarkResult }
      }

      // Otherwise, fall back to manual match batch data
      const manualSeasonIds = hasExplicitSeasonId
        ? [seasonId]
        : await findPublicManualBenchmarkSeasonIds(ctx.db, anchorDate)
      const manualResult = await buildManualHeadToHead(ctx.db, category.id, toolA.id, toolB.id, {
        seasonIds: manualSeasonIds,
        windowType: input.windowType,
        anchorDate,
        promptLevel: input.promptLevel,
        modelTier: input.modelTier,
      })

      const result = await resolveHeadToHeadWithHistoricalFallback(ctx.db, {
        categoryId: category.id,
        toolAId: toolA.id,
        toolBId: toolB.id,
        seasonIds: manualSeasonIds,
        primary: manualResult ?? benchmarkResult,
        promptLevel: input.promptLevel,
        modelTier: input.modelTier,
      })

      return { category, toolA, toolB, result }
    }),

  listFeatured: publicProcedure
    .input(
      z
        .object({
          categorySlug: z.string().min(1).max(100).optional(),
          subcategorySlug: z.string().min(1).max(100).optional(),
          limit: z.number().int().min(1).max(50).default(12),
          includeHistorical: z.boolean().default(false),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 12
      const includeHistorical = input?.includeHistorical ?? false
      const anchorDate = new Date().toISOString().slice(0, 10)

      const matchups: MatchupEntry[] = []
      const seenKeys = new Set<string>()

      const seasonId = await findLatestPublishedBenchmarkSeasonId(ctx.db, anchorDate)

      let subs: { id: string; name: string; slug: string }[] = []
      if (input?.subcategorySlug) {
        const subcategory = await ctx.db.query.subcategories.findFirst({
          where: eq(subcategories.slug, input.subcategorySlug),
        })
        subs = subcategory ? [subcategory] : []
      } else if (input?.categorySlug) {
        const group = await ctx.db.query.categories.findFirst({
          where: eq(categories.slug, input.categorySlug),
          with: {
            subcategories: {
              orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
            },
          },
        })
        subs = group?.subcategories ?? []
      }

      const windowBounds = getManualWindowBounds('trailing_28d', anchorDate)
      const eligibleManualSeasonIds = await findPublicManualBenchmarkSeasonIds(ctx.db, anchorDate)
      const hasCategoryScope = !!(input?.categorySlug || input?.subcategorySlug)
      const scopedSubcategoryIds = hasCategoryScope ? subs.map((sub) => sub.id) : null

      // ---------------------------------------------------------------
      // 1. Recent completed manual matchups (active)
      // ---------------------------------------------------------------
      if (matchups.length < limit) {
        await collectManualMatchups({
          db: ctx.db,
          eligibleManualSeasonIds,
          scopedSubcategoryIds,
          windowEndExclusive: windowBounds.endExclusive,
          windowStartInclusive: windowBounds.startInclusive,
          mode: 'within',
          seenKeys,
          matchups,
          status: 'active',
          cap: limit,
        })
      }

      // ---------------------------------------------------------------
      // 2. Fill remaining slots with auto-generated benchmark matchups
      // ---------------------------------------------------------------
      if (matchups.length < limit && seasonId) {
        if (!hasCategoryScope) {
          subs = await ctx.db.query.subcategories.findMany({
            orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
          })
        }

        const scoringCtx = await prepareScoringContext(ctx.db, seasonId, 'trailing_28d', anchorDate)

        if (scoringCtx.runIds.length > 0) {
          const allCategoryIds = subs.map((s) => s.id)
          const allDecisions = await fetchDecisions(ctx.db, scoringCtx.runIds, allCategoryIds)

          const decisionsByCategory = new Map<string, DecisionRow[]>()
          for (const d of allDecisions) {
            let list = decisionsByCategory.get(d.categoryId)
            if (!list) {
              list = []
              decisionsByCategory.set(d.categoryId, list)
            }
            list.push(d)
          }

          for (const sub of subs) {
            if (matchups.length >= limit) break

            const catDecisions = decisionsByCategory.get(sub.id) ?? []
            const ranking = rankFromDecisions(
              catDecisions,
              scoringCtx.weightConfigs,
              sub.id,
              'trailing_28d',
              anchorDate,
            )

            if (ranking.items.length < 2) continue

            const [top1, top2] = ranking.items
            if (!top1 || !top2) continue

            const key = matchupKey(sub.id, top1.toolId, top2.toolId)
            if (seenKeys.has(key)) continue
            seenKeys.add(key)

            const result = headToHeadFromDecisions(
              catDecisions,
              scoringCtx.weightConfigs,
              top1.toolId,
              top2.toolId,
              sub.id,
            )

            matchups.push({
              category: sub,
              toolA: {
                id: top1.toolId,
                name: top1.toolName,
                slug: top1.toolSlug,
                logoUrl: top1.toolLogoUrl,
              },
              toolB: {
                id: top2.toolId,
                name: top2.toolName,
                slug: top2.toolSlug,
                logoUrl: top2.toolLogoUrl,
              },
              result,
              status: 'active',
            })
          }
        }
      }

      // ---------------------------------------------------------------
      // 3. Historical manual matchups (no longer in the active window)
      // ---------------------------------------------------------------
      if (includeHistorical) {
        const historicalCap =
          matchups.length + serverSettings.benchmark.featuredMatchups.historicalMatchupsMax
        await collectManualMatchups({
          db: ctx.db,
          eligibleManualSeasonIds,
          scopedSubcategoryIds,
          windowEndExclusive: windowBounds.endExclusive,
          windowStartInclusive: windowBounds.startInclusive,
          mode: 'before',
          seenKeys,
          matchups,
          status: 'historical',
          cap: historicalCap,
        })
      }

      return matchups
    }),

  listByTool: publicProcedure
    .input(
      z.object({
        toolSlug: z.string().min(1).max(255),
        limit: z.number().int().min(1).max(50).default(6),
      }),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = new Date().toISOString().slice(0, 10)

      const tool = await ctx.db.query.tools.findFirst({
        where: eq(tools.slug, input.toolSlug),
        with: {
          toolCategories: {
            with: { category: true },
          },
        },
      })
      if (!tool) return []

      const subs = tool.toolCategories.map((tc) => tc.category)
      if (subs.length === 0) return []

      const seasonId = await findLatestPublishedBenchmarkSeasonId(ctx.db, anchorDate)
      if (!seasonId) return []

      const scoringCtx = await prepareScoringContext(ctx.db, seasonId, 'trailing_28d', anchorDate)
      if (scoringCtx.runIds.length === 0) return []

      const allCategoryIds = subs.map((s) => s.id)
      const allDecisions = await fetchDecisions(ctx.db, scoringCtx.runIds, allCategoryIds)

      const decisionsByCategory = new Map<string, DecisionRow[]>()
      for (const d of allDecisions) {
        let list = decisionsByCategory.get(d.categoryId)
        if (!list) {
          list = []
          decisionsByCategory.set(d.categoryId, list)
        }
        list.push(d)
      }

      type HeadToHeadResult = ReturnType<typeof headToHeadFromDecisions>
      const matchups: {
        category: { id: string; name: string; slug: string }
        toolA: { id: string; name: string; slug: string; logoUrl: string | null }
        toolB: { id: string; name: string; slug: string; logoUrl: string | null }
        result: HeadToHeadResult
      }[] = []

      for (const sub of subs) {
        const catDecisions = decisionsByCategory.get(sub.id) ?? []
        const ranking = rankFromDecisions(
          catDecisions,
          scoringCtx.weightConfigs,
          sub.id,
          'trailing_28d',
          anchorDate,
        )

        const toolIndex = ranking.items.findIndex((item) => item.toolId === tool.id)
        if (toolIndex === -1 || ranking.items.length < 2) continue

        // Pick the closest rival: the tool above in ranking, or #2 if this tool is #1
        const rivalIndex = toolIndex === 0 ? 1 : toolIndex - 1
        const rival = ranking.items[rivalIndex]
        const thisToolEntry = ranking.items[toolIndex]
        if (!rival || !thisToolEntry) continue

        // Always put this tool as toolA for consistent display
        const result = headToHeadFromDecisions(
          catDecisions,
          scoringCtx.weightConfigs,
          tool.id,
          rival.toolId,
          sub.id,
        )

        matchups.push({
          category: sub,
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
          result,
        })
      }

      // Sort by decisive case count descending, take limit
      matchups.sort((a, b) => b.result.decisiveCaseCount - a.result.decisiveCaseCount)
      return matchups.slice(0, input.limit)
    }),
})
