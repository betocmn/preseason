export const revalidate = 3600 // 1 hour

import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { CommentaryFeed } from '~/components/public/commentary-feed'
import { EmptyState } from '~/components/public/empty-state'
import { PercentageBar } from '~/components/public/percentage-bar'
import { PromptCarousel } from '~/components/public/prompt-carousel'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { serverSettings } from '~/constants/server-settings'
import { api } from '~/trpc/server'

export default async function HomePage() {
  const caller = await api()
  const today = new Date().toISOString().slice(0, 10)
  const pageSize = serverSettings.homepage.promptCarouselPageSize

  const getCachedPrompts = unstable_cache(
    async () => caller.prompt.listWithTopTools({ limit: pageSize, offset: 0, anchorDate: today }),
    ['homepage-prompts', today],
    { revalidate: serverSettings.homepage.promptCarouselRevalidateSeconds },
  )

  const [promptsResult, featuredMatchups, recentComments] = await Promise.all([
    getCachedPrompts(),
    caller.benchmarkMatch.listFeatured({ limit: 6 }),
    caller.comment.listRecent({ limit: 5 }),
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
              We track what tools AI models pick across thousands of prompts at every level, from
              vibe coding beginners to expert engineers.
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
              description="Prompts are vibe-coding scenarios used to test what tools LLMs recommend."
            />
          )}
        </section>

        {/* Featured Matchups */}
        <section>
          <div className="mb-4">
            <h2 className="text-base font-semibold">Active Matches</h2>
          </div>
          {featuredMatchups.length > 0 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featuredMatchups.map((m) => {
                  const slug = `${m.category.slug}--${m.toolA.slug}-vs-${m.toolB.slug}`
                  return (
                    <Card key={slug} className="transition-colors hover:bg-accent/50">
                      <Link href={`/matches/${slug}`}>
                        <CardContent className="p-4">
                          <div className="mb-2">
                            <Badge variant="secondary" className="text-xs">
                              {m.category.name}
                            </Badge>
                          </div>
                          <div className="mb-3 flex items-center gap-1.5 text-sm font-medium">
                            <Avatar className="h-5 w-5 bg-muted-foreground/25 ring-2 ring-muted-foreground/40">
                              {m.toolA.logoUrl && (
                                <AvatarImage src={m.toolA.logoUrl} alt={m.toolA.name} size={20} />
                              )}
                              <AvatarFallback className="text-[10px]">
                                {m.toolA.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {m.toolA.name}
                            <span className="text-muted-foreground">vs</span>
                            <Avatar className="h-5 w-5 bg-muted-foreground/25 ring-2 ring-muted-foreground/40">
                              {m.toolB.logoUrl && (
                                <AvatarImage src={m.toolB.logoUrl} alt={m.toolB.name} size={20} />
                              )}
                              <AvatarFallback className="text-[10px]">
                                {m.toolB.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {m.toolB.name}
                          </div>
                          {m.result.decisiveCaseCount > 0 ? (
                            <PercentageBar
                              valueA={m.result.aWins}
                              valueB={m.result.bWins}
                              labelA={m.toolA.name}
                              labelB={m.toolB.name}
                              size="sm"
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground">No decisive cases yet</p>
                          )}
                        </CardContent>
                      </Link>
                    </Card>
                  )
                })}
              </div>
              <div className="mt-3 text-center">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/matches" className="text-xs text-muted-foreground">
                    View all matches &rarr;
                  </Link>
                </Button>
              </div>
            </>
          ) : (
            <EmptyState
              title="No benchmark matchups yet"
              description="Head-to-head matchups are generated from benchmark data. Check back after benchmark runs complete."
            />
          )}
        </section>

        {/* Verified Critics */}
        {recentComments.items.length > 0 && (
          <section>
            <div className="mb-4">
              <h2 className="text-base font-semibold">Latest Verified Critics</h2>
            </div>
            <CommentaryFeed comments={recentComments.items} />
            <div className="mt-3 text-center">
              <Button variant="outline" size="sm" asChild>
                <Link href="/critics" className="text-xs text-muted-foreground">
                  View all critics &rarr;
                </Link>
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
