export const revalidate = 3600 // 1 hour

import { unstable_cache } from 'next/cache'
import { EmptyState } from '~/components/public/empty-state'
import { HomepageRankingsPreview } from '~/components/public/homepage-rankings-preview'
import { PromptCarousel } from '~/components/public/prompt-carousel'
import { serverSettings } from '~/constants/server-settings'
import { deferToRequestWhenDatabaseUnavailable } from '~/server/prerender'
import { publicApi } from '~/trpc/server'

export default async function HomePage() {
  await deferToRequestWhenDatabaseUnavailable()
  const caller = await publicApi()
  const today = new Date().toISOString().slice(0, 10)
  const pageSize = serverSettings.homepage.promptCarouselPageSize
  const rankingPreviewRevalidate = serverSettings.homepage.rankingPreview.revalidateSeconds

  const getCachedPrompts = unstable_cache(
    async () => caller.prompt.listWithTopTools({ limit: pageSize, offset: 0, anchorDate: today }),
    ['homepage-prompts', today],
    { revalidate: serverSettings.homepage.promptCarouselRevalidateSeconds },
  )

  const getCachedRankingPreviews = unstable_cache(
    async () =>
      caller.benchmarkRanking.listHomepagePreviews({ dateRange: 'all', anchorDate: today }),
    ['homepage-ranking-previews', today],
    { revalidate: rankingPreviewRevalidate },
  )

  const [promptsResult, rankingPreviews] = await Promise.all([
    getCachedPrompts(),
    getCachedRankingPreviews(),
  ])

  return (
    <div className="container py-8">
      <div className="space-y-10">
        {/* Hero + Latest Prompts */}
        <section className="grid items-stretch gap-4 lg:grid-cols-[2fr_3fr]">
          <div className="flex flex-col justify-center rounded-lg border bg-card px-6 py-8">
            <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">
              What <span className="italic">agents</span> want
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              We track which developer tools AI models pick across a frozen panel of vibe-coding
              prompts at every level, from beginners to expert engineers.
            </p>
          </div>

          {promptsResult.items.length > 0 && promptsResult.snapshot ? (
            <PromptCarousel
              initialPrompts={promptsResult.items}
              initialHasMore={promptsResult.hasMore}
              anchorDate={today}
              snapshot={promptsResult.snapshot}
            />
          ) : (
            <EmptyState
              title="No prompts yet"
              description="Prompts are vibe-coding scenarios used to test which devtools LLMs recommend."
            />
          )}
        </section>

        {/* Devtool Rankings Preview */}
        <section>
          <div className="mb-4">
            <h2 className="text-base font-semibold">Top Devtool Rankings</h2>
          </div>
          {rankingPreviews.length > 0 ? (
            <HomepageRankingsPreview previews={rankingPreviews} />
          ) : (
            <EmptyState
              title="No rankings yet"
              description="Category rankings appear once published benchmark runs are available. Check back after the next benchmark cycle."
            />
          )}
        </section>
      </div>
    </div>
  )
}
