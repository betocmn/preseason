import { TRPCError } from '@trpc/server'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { ModelFilterCompany, ModelFilterFamily } from '~/lib/model-filters'
import {
  anchorDateSchema,
  findBenchmarkSeasonId,
  findLatestPublishedBenchmarkSeasonId,
} from '~/server/api/helpers/benchmark'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import {
  benchmarkModelSnapshots,
  benchmarkSeasonModels,
  categories,
  subcategories,
  tools,
} from '~/server/db/schema'
import {
  computeCategoryGroupRanking,
  computeCategoryRanking,
  type DecisionRow,
  fetchDecisions,
  prepareScoringContext,
  rankFromDecisions,
} from '~/server/llm/benchmark/scoring'
import { promptLevelSchema } from '~/server/llm/prompts'

const windowTypeSchema = z
  .enum(['run_day', 'trailing_7d', 'trailing_28d', 'season_to_date'])
  .default('trailing_28d')

const tierFiltersSchema = z.object({
  promptLevel: promptLevelSchema.optional(),
  modelTier: z.enum(['frontier', 'mid', 'small']).optional(),
  modelSnapshotId: z.string().uuid().optional(),
})

async function resolveSeasonId(
  db: Parameters<typeof findBenchmarkSeasonId>[0],
  anchorDate: string,
  seasonId?: string,
) {
  if (seasonId) {
    const id = await findBenchmarkSeasonId(db, seasonId)
    if (!id) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'seasonId must reference a benchmark season',
      })
    }
    return id
  }
  return findLatestPublishedBenchmarkSeasonId(db, anchorDate)
}

export const benchmarkRankingRouter = createTRPCRouter({
  byCategory: publicProcedure
    .input(
      z
        .object({
          categorySlug: z.string().min(1).max(100),
          seasonId: z.string().uuid().optional(),
          windowType: windowTypeSchema,
          anchorDate: anchorDateSchema.optional(),
        })
        .merge(tierFiltersSchema),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)
      const category = await ctx.db.query.subcategories.findFirst({
        where: eq(subcategories.slug, input.categorySlug),
        with: { categoryGroup: true },
      })
      if (!category) {
        return { category: null, ranking: null }
      }

      const seasonId = await resolveSeasonId(ctx.db, anchorDate, input.seasonId)
      if (!seasonId) {
        return { category, ranking: null }
      }

      const ranking = await computeCategoryRanking(ctx.db, {
        categoryId: category.id,
        seasonId,
        windowType: input.windowType,
        anchorDate,
        promptLevel: input.promptLevel,
        modelTier: input.modelTier,
        modelSnapshotId: input.modelSnapshotId,
      })

      return { category, ranking }
    }),

  byCategoryGroup: publicProcedure
    .input(
      z
        .object({
          groupSlug: z.string().min(1).max(100),
          seasonId: z.string().uuid().optional(),
          windowType: windowTypeSchema,
          anchorDate: anchorDateSchema.optional(),
        })
        .merge(tierFiltersSchema),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)
      const group = await ctx.db.query.categories.findFirst({
        where: eq(categories.slug, input.groupSlug),
        with: {
          subcategories: {
            orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
          },
        },
      })
      if (!group) {
        return { categoryGroup: null, ranking: null }
      }

      if (group.subcategories.length === 0) {
        return { categoryGroup: group, ranking: null }
      }

      const seasonId = await resolveSeasonId(ctx.db, anchorDate, input.seasonId)
      if (!seasonId) {
        return { categoryGroup: group, ranking: null }
      }

      const ranking = await computeCategoryGroupRanking(ctx.db, {
        categoryGroupId: group.id,
        categoryIds: group.subcategories.map((sub) => sub.id),
        seasonId,
        windowType: input.windowType,
        anchorDate,
        promptLevel: input.promptLevel,
        modelTier: input.modelTier,
        modelSnapshotId: input.modelSnapshotId,
      })

      return { categoryGroup: group, ranking }
    }),

  listModelFilters: publicProcedure
    .input(
      z.object({
        seasonId: z.string().uuid().optional(),
        anchorDate: anchorDateSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)
      const seasonId = await resolveSeasonId(ctx.db, anchorDate, input.seasonId)

      if (!seasonId) {
        return { seasonId: null, companies: [] as ModelFilterCompany[] }
      }

      const rows = await ctx.db
        .select({
          modelSnapshotId: benchmarkModelSnapshots.id,
          company: benchmarkModelSnapshots.company,
          modelFamily: benchmarkModelSnapshots.modelFamily,
          modelVersion: benchmarkModelSnapshots.modelVersion,
          modelName: benchmarkModelSnapshots.name,
        })
        .from(benchmarkSeasonModels)
        .innerJoin(
          benchmarkModelSnapshots,
          eq(benchmarkSeasonModels.modelSnapshotId, benchmarkModelSnapshots.id),
        )
        .where(eq(benchmarkSeasonModels.seasonId, seasonId))
        .orderBy(
          asc(benchmarkModelSnapshots.company),
          asc(benchmarkModelSnapshots.modelFamily),
          asc(benchmarkModelSnapshots.modelVersion),
          asc(benchmarkModelSnapshots.name),
        )

      const companyMap = new Map<
        string,
        { name: string; families: Map<string, ModelFilterFamily> }
      >()
      for (const row of rows) {
        let company = companyMap.get(row.company)
        if (!company) {
          company = { name: row.company, families: new Map<string, ModelFilterFamily>() }
          companyMap.set(row.company, company)
        }

        let family = company.families.get(row.modelFamily)
        if (!family) {
          family = { name: row.modelFamily, models: [] }
          company.families.set(row.modelFamily, family)
        }

        family.models.push({
          id: row.modelSnapshotId,
          version: row.modelVersion,
          name: row.modelName,
        })
      }

      const companies: ModelFilterCompany[] = Array.from(companyMap.values()).map((company) => ({
        name: company.name,
        families: Array.from(company.families.values()),
      }))

      return { seasonId, companies }
    }),

  byTool: publicProcedure
    .input(
      z.object({
        toolSlug: z.string().min(1).max(255),
        windowType: windowTypeSchema,
        anchorDate: anchorDateSchema.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)

      const tool = await ctx.db.query.tools.findFirst({
        where: eq(tools.slug, input.toolSlug),
        with: {
          toolCategories: {
            with: {
              category: {
                with: { categoryGroup: true },
              },
            },
          },
        },
      })
      if (!tool) return { rankings: [] }

      const categoryIds = tool.toolCategories.map((tc) => tc.category.id)
      if (categoryIds.length === 0) return { rankings: [] }

      const seasonId = await findLatestPublishedBenchmarkSeasonId(ctx.db, anchorDate)
      if (!seasonId) return { rankings: [] }

      const scoringCtx = await prepareScoringContext(ctx.db, seasonId, input.windowType, anchorDate)
      if (scoringCtx.runIds.length === 0) return { rankings: [] }

      const allDecisions = await fetchDecisions(ctx.db, scoringCtx.runIds, categoryIds)

      const decisionsByCategory = new Map<string, DecisionRow[]>()
      for (const d of allDecisions) {
        let list = decisionsByCategory.get(d.categoryId)
        if (!list) {
          list = []
          decisionsByCategory.set(d.categoryId, list)
        }
        list.push(d)
      }

      const rankings = tool.toolCategories
        .map((tc) => {
          const cat = tc.category
          const catDecisions = decisionsByCategory.get(cat.id) ?? []
          const ranking = rankFromDecisions(
            catDecisions,
            scoringCtx.weightConfigs,
            cat.id,
            input.windowType,
            anchorDate,
          )

          const toolIndex = ranking.items.findIndex((item) => item.toolId === tool.id)
          if (toolIndex === -1) return null

          const entry = ranking.items[toolIndex]!
          return {
            category: {
              id: cat.id,
              name: cat.name,
              slug: cat.slug,
              groupSlug: cat.categoryGroup?.slug ?? '',
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
          }
        })
        .filter((r) => r !== null)
        .sort((a, b) => a.rank - b.rank)

      return { rankings }
    }),
})
