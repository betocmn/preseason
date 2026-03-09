'use client'

import { useState } from 'react'
import { EmptyState } from '~/components/public/empty-state'
import { LoadMoreButton } from '~/components/public/load-more-button'
import { MatchCard } from '~/components/public/match-card'
import { api } from '~/trpc/react'

type MatchesPageContentProps = {
  initialGroupSlug?: string
  initialCategorySlug?: string
  initialToolSlug?: string
}

const PAGE_SIZE = 12

export function MatchesPageContent({
  initialGroupSlug,
  initialCategorySlug,
  initialToolSlug,
}: MatchesPageContentProps) {
  const [settledLimit, setSettledLimit] = useState(PAGE_SIZE)

  const activeInput =
    initialGroupSlug || initialCategorySlug || initialToolSlug
      ? {
          groupSlug: initialGroupSlug,
          categorySlug: initialCategorySlug,
          toolSlug: initialToolSlug,
        }
      : undefined

  const { data: activeMatches } = api.match.listActive.useQuery(activeInput)

  const { data: settledData, isLoading: settledLoading } = api.match.listSettled.useQuery({
    limit: settledLimit,
    offset: 0,
    groupSlug: initialGroupSlug || undefined,
    categorySlug: initialCategorySlug || undefined,
    toolSlug: initialToolSlug || undefined,
  })

  const active = activeMatches ?? []
  const settled = settledData?.items ?? []
  const settledTotal = settledData?.total ?? 0
  const hasMoreSettled = settled.length < settledTotal

  return (
    <div>
      {/* Active Matches */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Active</h2>
        {active.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((match) => (
              <MatchCard
                key={match.id}
                slug={match.slug}
                status={match.status}
                toolA={match.toolA}
                toolB={match.toolB}
                category={match.category}
                toolAScore={match.toolAScore}
                toolBScore={match.toolBScore}
                winnerToolId={match.winnerToolId}
                periodStart={match.periodStart}
                periodEnd={match.periodEnd}
                showPeriod
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No live matches"
            description="Matches are created when tools compete head-to-head in a category."
          />
        )}
      </section>

      {/* Settled Matches */}
      <section>
        <h2 className="mb-4 text-lg font-semibold">Recent Results</h2>
        {settled.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {settled.map((match) => (
              <MatchCard
                key={match.id}
                slug={match.slug}
                status={match.status}
                toolA={match.toolA}
                toolB={match.toolB}
                category={match.category}
                toolAScore={match.toolAScore}
                toolBScore={match.toolBScore}
                winnerToolId={match.winnerToolId}
                periodStart={match.periodStart}
                periodEnd={match.periodEnd}
                showPeriod
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No settled matches"
            description="Settled matches with results will appear here."
          />
        )}
        <LoadMoreButton
          onLoadMore={() => setSettledLimit((prev) => prev + PAGE_SIZE)}
          hasMore={hasMoreSettled}
          isLoading={settledLoading}
        />
      </section>
    </div>
  )
}
