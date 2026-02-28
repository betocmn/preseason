import { ArrowRight, Swords, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { EmptyState } from '~/components/public/empty-state'
import { MatchCard } from '~/components/public/match-card'
import { RecommendationCard } from '~/components/public/recommendation-card'
import { ToolBadge } from '~/components/public/tool-badge'
import { TrendIndicator } from '~/components/public/trend-indicator'
import { api } from '~/trpc/server'

export default async function HomePage() {
  const caller = await api()

  const [feedResult, trending, categories, activeMatches] = await Promise.all([
    caller.recommendation.getFeed({ limit: 5, offset: 0 }),
    caller.recommendation.getTrending({ currentWindowDays: 7, previousWindowDays: 7, limit: 5 }),
    caller.category.list(),
    caller.match.listActive(),
  ])

  const feed = feedResult.items
  const trendingItems = trending.items

  return (
    <div className="container py-8">
      {/* Hero */}
      <section className="mb-12 text-center">
        <h1 className="mb-3 text-4xl font-bold tracking-tight md:text-5xl">
          What tools do AI models actually recommend?
        </h1>
        <p className="mx-auto mb-6 max-w-2xl text-lg text-muted-foreground">
          We run vibe-coding prompts against top LLMs daily and track which third-party tools they recommend. Browse rankings, matches, and trends.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild>
            <Link href="/feed">
              Browse feed
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/rankings">View rankings</Link>
          </Button>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left column: Matches + Feed */}
        <div className="space-y-8 lg:col-span-2">
          {/* Active Matches */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Swords className="h-5 w-5" />
                Active Matches
              </h2>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/matches">View all</Link>
              </Button>
            </div>
            {activeMatches.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {activeMatches.slice(0, 4).map((match) => (
                  <MatchCard
                    key={match.id}
                    id={match.id}
                    status={match.status}
                    toolA={match.toolA}
                    toolB={match.toolB}
                    category={match.category}
                    toolAScore={match.toolAScore}
                    toolBScore={match.toolBScore}
                    winnerToolId={match.winnerToolId}
                    periodStart={match.periodStart}
                    periodEnd={match.periodEnd}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Swords className="h-10 w-10" />}
                title="No active matches"
                description="Matches pit tools head-to-head based on LLM recommendations. Check back after runs have been completed."
              />
            )}
          </section>

          {/* Recent Recommendations */}
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recent Recommendations</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/feed">View feed</Link>
              </Button>
            </div>
            {feed.length > 0 ? (
              <div className="space-y-3">
                {feed.map((item) => (
                  <RecommendationCard
                    key={item.id}
                    id={item.id}
                    confidence={item.confidence}
                    reasoning={item.reasoning}
                    tool={item.tool}
                    category={item.category}
                    llm={item.llm}
                    prompt={item.prompt}
                    createdAt={item.createdAt}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No recommendations yet"
                description="Recommendations appear here after LLM runs complete. Check back soon."
                action={{ label: 'Learn more', href: '/feed' }}
              />
            )}
          </section>
        </div>

        {/* Right column: Trending + Categories */}
        <div className="space-y-8">
          {/* Trending */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" />
                Trending Tools
              </CardTitle>
            </CardHeader>
            <CardContent>
              {trendingItems.length > 0 ? (
                <div className="space-y-3">
                  {trendingItems.map((item) => (
                    <div key={item.tool.id} className="flex items-center justify-between">
                      <ToolBadge name={item.tool.name} slug={item.tool.slug} size="sm" />
                      <TrendIndicator value={item.rateChange} size="sm" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No trending data yet. Trends appear after multiple runs.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Categories */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <Button key={cat.id} variant="secondary" size="sm" asChild>
                    <Link href={`/rankings/${cat.slug}`}>{cat.name}</Link>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
