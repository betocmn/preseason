'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { EmptyState } from '~/components/public/empty-state'
import { LoadMoreButton } from '~/components/public/load-more-button'
import { MatchCard } from '~/components/public/match-card'
import { api } from '~/trpc/react'

type Category = { id: string; name: string; slug: string }

type MatchesPageContentProps = {
  categories: Category[]
}

const PAGE_SIZE = 12

export function MatchesPageContent({ categories }: MatchesPageContentProps) {
  const [categorySlug, setCategorySlug] = useState<string | undefined>()
  const [settledLimit, setSettledLimit] = useState(PAGE_SIZE)

  const { data: activeMatches } = api.match.listActive.useQuery(
    categorySlug ? { categorySlug } : undefined,
  )

  const { data: settledData, isLoading: settledLoading } = api.match.listSettled.useQuery({
    limit: settledLimit,
    offset: 0,
    categorySlug: categorySlug || undefined,
  })

  const active = activeMatches ?? []
  const settled = settledData?.items ?? []
  const settledTotal = settledData?.total ?? 0
  const hasMoreSettled = settled.length < settledTotal

  return (
    <div>
      <div className="mb-6">
        <Select
          value={categorySlug ?? 'all'}
          onValueChange={(v) => {
            setCategorySlug(v === 'all' ? undefined : v)
            setSettledLimit(PAGE_SIZE)
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.slug}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Active Matches */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold">Active Matches</h2>
        {active.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((match) => (
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
            title="No active matches"
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
