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
} from '~/server/db/schema'
import { computeCategoryGroupRanking, computeCategoryRanking } from '~/server/llm/benchmark/scoring'
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
})
