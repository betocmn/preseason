import { asc, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { serverSettings } from '~/constants/server-settings'
import { db } from '~/server/db'
import { categories, subcategories } from '~/server/db/schema'
import { invalidatePublicBenchmarkCache } from './public-cache'
import {
  computeCategoryGroupRanking,
  computeCategoryRanking,
  computeCategoryRankings,
} from './scoring'

/** Called after publication commits. Cache failures must never undo a successful run. */
export async function refreshPublicBenchmarkCache(database: typeof db) {
  if (process.env.NODE_ENV !== 'production' || database !== db) return
  try {
    invalidatePublicBenchmarkCache()
    revalidatePath('/', 'layout')

    // Precompute after the publication response, rather than writing entries while
    // that request is still scheduling their tag invalidation.
    after(async () => {
      try {
        const groups = await database.query.categories.findMany({
          where: inArray(categories.slug, [...serverSettings.publicSite.categoryGroupSlugs]),
          with: {
            subcategories: { orderBy: [asc(subcategories.displayOrder), asc(subcategories.name)] },
          },
        })
        const anchorDate = new Date().toISOString().slice(0, 10)
        for (const group of groups) {
          await computeCategoryGroupRanking(database, {
            categoryGroupId: group.id,
            categoryIds: group.subcategories.map((sub) => sub.id),
            windowType: 'season_to_date',
            anchorDate,
          })
          for (const sub of group.subcategories) {
            await computeCategoryRanking(database, {
              categoryId: sub.id,
              windowType: 'season_to_date',
              anchorDate,
            })
          }
          if (group.slug === serverSettings.homepage.rankingPreview.groupSlug) {
            const bySlug = new Map(group.subcategories.map((sub) => [sub.slug, sub.id]))
            const categoryIds = serverSettings.homepage.rankingPreview.subcategorySlugs.flatMap(
              (slug) => {
                const id = bySlug.get(slug)
                return id ? [id] : []
              },
            )
            await computeCategoryRankings(database, {
              categoryIds,
              windowType: 'season_to_date',
              anchorDate,
            })
          }
        }
      } catch (error) {
        reportRefreshFailure(error)
      }
    })
  } catch (error) {
    reportRefreshFailure(error)
  }
}

function reportRefreshFailure(error: unknown) {
  console.error(
    'Failed to refresh public benchmark summaries; the cache will expire normally.',
    error,
  )
}
