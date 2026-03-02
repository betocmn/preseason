import { Swords } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '~/components/public/empty-state'
import { MatchCard } from '~/components/public/match-card'
import { RecommendationCard } from '~/components/public/recommendation-card'
import { api } from '~/trpc/server'

export default async function HomePage() {
  const caller = await api()

  const [feedResult, activeMatches] = await Promise.all([
    caller.recommendation.getFeed({ limit: 5, offset: 0 }),
    caller.match.listActive(),
  ])

  const feed = feedResult.items

  return (
    <div className="container max-w-4xl py-6">
      <div className="space-y-8">
        {/* Active Matches */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Swords className="h-4 w-4" />
              Active Matches
            </h2>
            <Link href="/matches" className="text-sm text-muted-foreground hover:text-foreground">
              View all
            </Link>
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
            <h2 className="text-base font-semibold">Recent Recommendations</h2>
            <Link href="/feed" className="text-sm text-muted-foreground hover:text-foreground">
              View feed
            </Link>
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
    </div>
  )
}
