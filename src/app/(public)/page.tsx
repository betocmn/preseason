import Link from 'next/link'
import { EmptyState } from '~/components/public/empty-state'
import { MatchCard } from '~/components/public/match-card'
import { PromptCarousel } from '~/components/public/prompt-carousel'
import { api } from '~/trpc/server'

export default async function HomePage() {
  const caller = await api()

  const [promptsWithTools, activeMatches] = await Promise.all([
    caller.prompt.listWithTopTools({ limit: 5 }),
    caller.match.listActive(),
  ])

  return (
    <div className="container py-8">
      <div className="space-y-10">
        {/* Hero + Latest Prompts */}
        <section className="grid items-stretch gap-10 lg:grid-cols-[2fr_3fr]">
          <div className="flex flex-col justify-center rounded-lg border bg-card px-6 py-8">
            <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">
              What <span className="italic">agents</span> want
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              We track what tools AI models pick across thousands of prompts at every level, from
              vibe coding beginners to expert engineers.
            </p>
          </div>

          {promptsWithTools.length > 0 ? (
            <PromptCarousel prompts={promptsWithTools} />
          ) : (
            <EmptyState
              title="No prompts yet"
              description="Prompts are vibe-coding scenarios used to test what tools LLMs recommend."
            />
          )}
        </section>

        {/* Active Matches */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Live Matches</h2>
            <Link href="/matches" className="text-sm text-muted-foreground hover:text-foreground">
              View all
            </Link>
          </div>
          {activeMatches.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {activeMatches.slice(0, 12).map((match) => (
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
              title="No live matches"
              description="Matches pit tools head-to-head based on LLM recommendations. Check back after runs have been completed."
            />
          )}
        </section>
      </div>
    </div>
  )
}
