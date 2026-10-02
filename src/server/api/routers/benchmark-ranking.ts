import { TRPCError } from '@trpc/server'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { serverSettings } from '~/constants/server-settings'
import { anchorDateSchema, findBenchmarkSeasonId, monthsAgo } from '~/server/api/helpers/benchmark'
import {
  listMeasuredModelRanges,
  resolveModelRangeSelection,
} from '~/server/api/helpers/model-ranges'
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc'
import { categories, subcategories, tools } from '~/server/db/schema'
import {
  computeCategoryGroupRanking,
  computeCategoryRanking,
  computeCategoryRankings,
} from '~/server/llm/benchmark/scoring'
import { promptLevelSchema } from '~/server/llm/prompts'

const windowTypeSchema = z
  .enum(['run_day', 'trailing_7d', 'trailing_28d', 'season_to_date'])
  .default('season_to_date')

// Public calendar date-range filter for the rankings page. Defaults to all time.
const dateRangeSchema = z.enum(['all', '1m', '3m', '6m']).default('all')

const DATE_RANGE_MONTHS: Record<Exclude<z.infer<typeof dateRangeSchema>, 'all'>, number> = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
}

/**
 * Translate the public date-range filter into scoring inputs. All ranges include every
 * published run in the window (season_to_date, no trailing slice); bounded ranges add a
 * scheduledFor lower bound plus a preceding period for the trend baseline.
 */
function resolveDateRange(dateRange: z.infer<typeof dateRangeSchema>, anchorDate: string) {
  if (dateRange === 'all') {
    return {
      windowType: 'season_to_date' as const,
      startDate: undefined,
      previousStartDate: undefined,
    }
  }
  const months = DATE_RANGE_MONTHS[dateRange]
  return {
    windowType: 'season_to_date' as const,
    startDate: monthsAgo(anchorDate, months),
    previousStartDate: monthsAgo(anchorDate, months * 2),
  }
}

const tierFiltersSchema = z.object({
  promptLevel: promptLevelSchema.optional(),
  modelTier: z.enum(['frontier', 'mid', 'small']).optional(),
  modelSnapshotId: z.string().uuid().optional(),
  modelRangeId: z.string().min(1).max(255).optional(),
})

/**
 * Resolve the season for public ranking reads. When an explicit `seasonId` is
 * supplied it is validated and returned. When omitted, `undefined` is returned
 * so the scoring helpers span every published benchmark season — this keeps the
 * public date-range filter meaningful even right after a new season launches.
 */
async function resolveRankingSeasonId(
  db: Parameters<typeof findBenchmarkSeasonId>[0],
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
  return undefined
}

export const benchmarkRankingRouter = createTRPCRouter({
  /**
   * Curated subcategory ranking previews for the homepage. Returns rankings for
   * the configured top-N tools in each featured subcategory, preserving the
   * configured display order.
   */
  listHomepagePreviews: publicProcedure
    .input(
      z
        .object({
          seasonId: z.string().uuid().optional(),
          dateRange: dateRangeSchema.default('all'),
          anchorDate: anchorDateSchema.optional(),
        })
        .merge(tierFiltersSchema)
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const preview = serverSettings.homepage.rankingPreview
      const anchorDate = input?.anchorDate ?? new Date().toISOString().slice(0, 10)
      const dateRange = input?.dateRange ?? 'all'
      const { windowType, startDate } = resolveDateRange(dateRange, anchorDate)

      if (!serverSettings.publicSite.categoryGroupSlugs.includes(preview.groupSlug)) {
        return []
      }

      const group = await ctx.db.query.categories.findFirst({
        where: eq(categories.slug, preview.groupSlug),
      })
      if (!group) {
        return []
      }

      const rows = await ctx.db.query.subcategories.findMany({
        where: and(
          eq(subcategories.categoryId, group.id),
          inArray(subcategories.slug, [...preview.subcategorySlugs]),
        ),
      })

      const bySlug = new Map(rows.map((row) => [row.slug, row]))
      const ordered = preview.subcategorySlugs
        .map((slug) => bySlug.get(slug))
        .filter((row): row is NonNullable<typeof row> => row != null)
      if (ordered.length === 0) {
        return []
      }

      const seasonId = await resolveRankingSeasonId(ctx.db, input?.seasonId)
      const modelSelection = await resolveModelRangeSelection(ctx.db, input)
      const summaries = await computeCategoryRankings(ctx.db, {
        categoryIds: ordered.map((category) => category.id),
        seasonId,
        windowType,
        anchorDate,
        startDate,
        promptLevel: input?.promptLevel,
        modelTier: input?.modelTier,
        ...modelSelection,
      })
      const rankingsByCategory = new Map(summaries.map((ranking) => [ranking.categoryId, ranking]))
      return ordered.flatMap((category) => {
        const ranking = rankingsByCategory.get(category.id)
        if (!ranking) return []

        return {
          slug: category.slug,
          name: category.name,
          groupSlug: preview.groupSlug,
          ranking: {
            items: ranking.items.slice(0, preview.toolsPerCategory),
            totalEligibleDecisions: ranking.totalEligibleDecisions,
            meetsPublicationThreshold: ranking.meetsPublicationThreshold,
          },
        }
      })
    }),

  listIndexGroups: publicProcedure
    .input(
      z
        .object({
          seasonId: z.string().uuid().optional(),
          dateRange: dateRangeSchema,
          anchorDate: anchorDateSchema.optional(),
        })
        .merge(tierFiltersSchema),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)
      const { windowType, startDate, previousStartDate } = resolveDateRange(
        input.dateRange,
        anchorDate,
      )
      const groups = await ctx.db.query.categories.findMany({
        where: inArray(categories.slug, [...serverSettings.publicSite.categoryGroupSlugs]),
        orderBy: [asc(categories.displayOrder), asc(categories.name)],
        with: {
          subcategories: {
            orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)],
          },
        },
      })

      const seasonId = await resolveRankingSeasonId(ctx.db, input.seasonId)
      const modelSelection = await resolveModelRangeSelection(ctx.db, input)

      return Promise.all(
        groups.map(async (group) => {
          if (group.subcategories.length === 0) {
            return {
              slug: group.slug,
              name: group.name,
              ranking: null,
            }
          }

          const ranking = await computeCategoryGroupRanking(ctx.db, {
            categoryGroupId: group.id,
            categoryIds: group.subcategories.map((sub) => sub.id),
            seasonId,
            windowType,
            anchorDate,
            startDate,
            previousStartDate,
            promptLevel: input.promptLevel,
            modelTier: input.modelTier,
            ...modelSelection,
          })

          return {
            slug: group.slug,
            name: group.name,
            ranking: ranking
              ? {
                  items: ranking.items,
                  totalEligibleDecisions: ranking.totalEligibleDecisions,
                  meetsPublicationThreshold: ranking.meetsPublicationThreshold,
                }
              : null,
          }
        }),
      )
    }),

  byCategory: publicProcedure
    .input(
      z
        .object({
          categorySlug: z.string().min(1).max(100),
          seasonId: z.string().uuid().optional(),
          dateRange: dateRangeSchema,
          anchorDate: anchorDateSchema.optional(),
        })
        .merge(tierFiltersSchema),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)
      const { windowType, startDate, previousStartDate } = resolveDateRange(
        input.dateRange,
        anchorDate,
      )
      const category = await ctx.db.query.subcategories.findFirst({
        where: eq(subcategories.slug, input.categorySlug),
        with: { categoryGroup: true },
      })
      if (!category) {
        return { category: null, ranking: null }
      }

      const seasonId = await resolveRankingSeasonId(ctx.db, input.seasonId)
      const modelSelection = await resolveModelRangeSelection(ctx.db, input)

      const ranking = await computeCategoryRanking(ctx.db, {
        categoryId: category.id,
        seasonId,
        windowType,
        anchorDate,
        startDate,
        previousStartDate,
        promptLevel: input.promptLevel,
        modelTier: input.modelTier,
        ...modelSelection,
      })

      return { category, ranking }
    }),

  byCategoryGroup: publicProcedure
    .input(
      z
        .object({
          groupSlug: z.string().min(1).max(100),
          seasonId: z.string().uuid().optional(),
          dateRange: dateRangeSchema,
          anchorDate: anchorDateSchema.optional(),
        })
        .merge(tierFiltersSchema),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)
      const { windowType, startDate, previousStartDate } = resolveDateRange(
        input.dateRange,
        anchorDate,
      )
      if (!serverSettings.publicSite.categoryGroupSlugs.includes(input.groupSlug)) {
        return { categoryGroup: null, ranking: null }
      }
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

      const seasonId = await resolveRankingSeasonId(ctx.db, input.seasonId)
      const modelSelection = await resolveModelRangeSelection(ctx.db, input)

      const ranking = await computeCategoryGroupRanking(ctx.db, {
        categoryGroupId: group.id,
        categoryIds: group.subcategories.map((sub) => sub.id),
        seasonId,
        windowType,
        anchorDate,
        startDate,
        previousStartDate,
        promptLevel: input.promptLevel,
        modelTier: input.modelTier,
        ...modelSelection,
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
      const seasonId = await resolveRankingSeasonId(ctx.db, input.seasonId)
      return {
        seasonId: seasonId ?? null,
        companies: await listMeasuredModelRanges(ctx.db, anchorDate, seasonId),
      }
    }),

  resolveModelRange: publicProcedure
    .input(
      z.object({
        modelSnapshotId: z.string().uuid(),
        modelRangeId: z.string().min(1).max(255).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const selection = await resolveModelRangeSelection(ctx.db, input)
      return { modelRangeId: selection.modelRangeId }
    }),

  byTool: publicProcedure
    .input(
      z
        .object({
          toolSlug: z.string().min(1).max(255),
          windowType: windowTypeSchema,
          anchorDate: anchorDateSchema.optional(),
        })
        .merge(tierFiltersSchema),
    )
    .query(async ({ ctx, input }) => {
      const anchorDate = input.anchorDate ?? new Date().toISOString().slice(0, 10)
      const modelSelection = await resolveModelRangeSelection(ctx.db, input)

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

      const summaries = await computeCategoryRankings(ctx.db, {
        categoryIds,
        windowType: input.windowType,
        anchorDate,
        ...modelSelection,
        promptLevel: input.promptLevel,
        modelTier: input.modelTier,
      })
      const rankingsByCategory = new Map(summaries.map((ranking) => [ranking.categoryId, ranking]))

      const rankings = tool.toolCategories
        .map((tc) => {
          const cat = tc.category
          const ranking = rankingsByCategory.get(cat.id)
          if (!ranking) return null

          const toolIndex = ranking.items.findIndex((item) => item.toolId === tool.id)
          if (toolIndex === -1) return null

          const entry = ranking.items[toolIndex]
          if (!entry) return null

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
