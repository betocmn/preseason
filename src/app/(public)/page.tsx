export const revalidate = 3600 // 1 hour

import { unstable_cache } from 'next/cache'
import { HomepageIntro } from '~/components/public/homepage-intro'
import { HomepageRankings } from '~/components/public/homepage-rankings'
import { serverSettings } from '~/constants/server-settings'
import { deferToRequestWhenDatabaseUnavailable } from '~/server/prerender'
import { publicApi } from '~/trpc/server'

export default async function HomePage() {
  await deferToRequestWhenDatabaseUnavailable()
  const caller = await publicApi()
  const today = new Date().toISOString().slice(0, 10)
  const cacheOptions = {
    revalidate: serverSettings.homepage.rankingPreview.revalidateSeconds,
    tags: [serverSettings.publicSite.benchmarkCacheTag],
  }
  const getCachedRankingPreviews = unstable_cache(
    async () =>
      caller.benchmarkRanking.listHomepagePreviews({ dateRange: 'all', anchorDate: today }),
    ['homepage-ranking-previews', today],
    cacheOptions,
  )
  const getCachedModels = unstable_cache(
    async () => caller.benchmarkRanking.listModelFilters({ anchorDate: today }),
    ['homepage-model-filters', today],
    cacheOptions,
  )
  const [previews, models] = await Promise.all([getCachedRankingPreviews(), getCachedModels()])

  return (
    <div className="container px-4 py-6 sm:px-8 sm:py-10">
      <HomepageIntro />
      <HomepageRankings
        initialPreviews={previews}
        companies={models.companies}
        anchorDate={today}
      />
    </div>
  )
}
