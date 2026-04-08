import { TRPCError } from '@trpc/server'
import { and, asc, desc, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import {
  anchorDateSchema,
  findBenchmarkSeasonId,
  findLatestPublishedBenchmarkSeasonId,
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
  wilsonInterval,
} from '~/server/llm/benchmark/scoring'
import { promptLevelSchema } from '~/server/llm/prompts'

type MatchupEntry = {
  category: { id: string; name: string; slug: string }
  toolA: { id: string; name: string; slug: string; logoUrl: string | null }
  toolB: { id: string; name: string; slug: string; logoUrl: string | null }
  result: HeadToHeadResult
}

function matchupKey(categoryId: string, toolAId: string, toolBId: string) {
  return [categoryId, toolAId < toolBId ? toolAId : toolBId, toolAId < toolBId ? toolBId : toolAId]
    .join(':')
    .toLowerCase()
}

async function buildManualHeadToHead(
  database: typeof DatabaseInstance,
  categoryId: string,
  toolAId: string,
  toolBId: string,
): Promise<HeadToHeadResult | null> {
  const batches = await database.query.matchBatches.findMany({
    where: and(
      eq(matchBatches.triggerMode, 'manual'),
      eq(matchBatches.status, 'completed'),
      eq(matchBatches.categoryId, categoryId),
      or(
        and(eq(matchBatches.toolAId, toolAId), eq(matchBatches.toolBId, toolBId)),
        and(eq(matchBatches.toolAId, toolBId), eq(matchBatches.toolBId, toolAId)),
      ),
    ),
    orderBy: [desc(matchBatches.createdAt)],
    with: {
      evaluations: {
        where: eq(matchEvaluations.status, 'completed'),
        with: { modelSnapshot: true },
      },
    },
  })

  if (batches.length === 0) return null

  let aWins = 0
  let bWins = 0
  let abstains = 0
  const modelBreakdownMap = new Map<string, HeadToHeadBreakdownEntry>()

  for (const batch of batches) {
    const flipped = batch.toolAId !== toolAId
    for (const ev of batch.evaluations) {
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
          tier: ev.modelSnapshot.tier as ModelTier,
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
    modelBreakdown: Array.from(modelBreakdownMap.values()).map((e) => ({
      ...e,
      aWinRate: e.decisiveCaseCount > 0 ? e.aWins / e.decisiveCaseCount : 0,
    })),
    promptBreakdown: [],
    meetsPublicationThreshold: decisiveCaseCount >= 30,
  }
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
          return { category, toolA, toolB, result: null }
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
      const manualResult = await buildManualHeadToHead(ctx.db, category.id, toolA.id, toolB.id)

      return { category, toolA, toolB, result: manualResult ?? benchmarkResult }
    }),

  listFeatured: publicProcedure
    .input(
      z
        .object({
          categorySlug: z.string().min(1).max(100).optional(),
          limit: z.number().int().min(1).max(50).default(12),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 12
      const anchorDate = new Date().toISOString().slice(0, 10)

      const matchups: MatchupEntry[] = []
      const seenKeys = new Set<string>()

      // ---------------------------------------------------------------
      // 1. Auto-generated benchmark matchups (top 2 per category)
      // ---------------------------------------------------------------
      const seasonId = await findLatestPublishedBenchmarkSeasonId(ctx.db, anchorDate)

      let subs: { id: string; name: string; slug: string }[] = []
      if (seasonId) {
        if (input?.categorySlug) {
          const group = await ctx.db.query.categories.findFirst({
            where: eq(categories.slug, input.categorySlug),
            with: {
              subcategories: {
                orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
              },
            },
          })
          subs = group?.subcategories ?? []
        } else {
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
            })
          }
        }
      }

      // ---------------------------------------------------------------
      // 2. Fill remaining slots with manual match batches
      // ---------------------------------------------------------------
      if (matchups.length < limit) {
        const manualBatches = await ctx.db.query.matchBatches.findMany({
          where: and(eq(matchBatches.triggerMode, 'manual'), eq(matchBatches.status, 'completed')),
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

        for (const batch of manualBatches) {
          if (matchups.length >= limit) break

          const key = matchupKey(batch.categoryId, batch.toolAId, batch.toolBId)
          if (seenKeys.has(key)) continue
          seenKeys.add(key)

          const evals = batch.evaluations
          let aWins = 0
          let bWins = 0
          let abstains = 0
          for (const ev of evals) {
            if (ev.winnerDecision === 'tool_a') aWins++
            else if (ev.winnerDecision === 'tool_b') bWins++
            else abstains++
          }
          const decisiveCaseCount = aWins + bWins
          const aWinRate = decisiveCaseCount > 0 ? aWins / decisiveCaseCount : 0
          const bWinRate = decisiveCaseCount > 0 ? bWins / decisiveCaseCount : 0
          const ci = wilsonInterval(aWins, decisiveCaseCount)

          const modelBreakdownMap = new Map<string, HeadToHeadBreakdownEntry>()
          for (const ev of evals) {
            const msId = ev.modelSnapshotId
            let entry = modelBreakdownMap.get(msId)
            if (!entry) {
              entry = {
                id: msId,
                label: ev.modelSnapshot.name,
                tier: ev.modelSnapshot.tier as ModelTier,
                aWins: 0,
                bWins: 0,
                abstains: 0,
                otherToolCount: 0,
                decisiveCaseCount: 0,
                aWinRate: 0,
              }
              modelBreakdownMap.set(msId, entry)
            }
            if (ev.winnerDecision === 'tool_a') {
              entry.aWins++
              entry.decisiveCaseCount++
            } else if (ev.winnerDecision === 'tool_b') {
              entry.bWins++
              entry.decisiveCaseCount++
            } else entry.abstains++
          }

          const modelBreakdown = Array.from(modelBreakdownMap.values()).map((e) => ({
            ...e,
            aWinRate: e.decisiveCaseCount > 0 ? e.aWins / e.decisiveCaseCount : 0,
          }))

          const result: HeadToHeadResult = {
            toolAId: batch.toolAId,
            toolBId: batch.toolBId,
            categoryId: batch.categoryId,
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
            modelBreakdown,
            promptBreakdown: [],
            meetsPublicationThreshold: decisiveCaseCount >= 30,
          }

          matchups.push({
            category: batch.category,
            toolA: {
              id: batch.toolA.id,
              name: batch.toolA.name,
              slug: batch.toolA.slug,
              logoUrl: batch.toolA.logoUrl,
            },
            toolB: {
              id: batch.toolB.id,
              name: batch.toolB.name,
              slug: batch.toolB.slug,
              logoUrl: batch.toolB.logoUrl,
            },
            result,
          })
        }
      }

      return matchups
    }),
})
