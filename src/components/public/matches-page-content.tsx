'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { EmptyState } from '~/components/public/empty-state'
import { PercentageBar } from '~/components/public/percentage-bar'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { api, type RouterOutputs } from '~/trpc/react'

type MatchItem = RouterOutputs['benchmarkMatch']['listFeatured'][number]

type MatchesPageContentProps = {
  initialItems: MatchItem[]
}

function matchSlug(categorySlug: string, toolASlug: string, toolBSlug: string) {
  return `${categorySlug}--${toolASlug}-vs-${toolBSlug}`
}

export function MatchesPageContent({ initialItems }: MatchesPageContentProps) {
  const searchParams = useSearchParams()
  const category = searchParams.get('category') ?? undefined
  const safeCategory =
    category && category.length >= 1 && category.length <= 100 ? category : undefined
  const { data, isFetching } = api.benchmarkMatch.listFeatured.useQuery(
    safeCategory
      ? { categorySlug: safeCategory, limit: 50, includeHistorical: true }
      : { limit: 50, includeHistorical: true },
    { enabled: !!safeCategory },
  )

  if (safeCategory && !data && isFetching) {
    return <p className="text-sm text-muted-foreground">Loading matches...</p>
  }

  const items = safeCategory ? (data ?? []) : initialItems

  if (items.length === 0) {
    return (
      <EmptyState
        title="No benchmark matchups yet"
        description="Head-to-head matchups come from recent manual match batches and benchmark ranking data. Check back after benchmark runs or new manual matches complete."
      />
    )
  }

  const activeItems = items.filter((m) => m.status === 'active')
  const historicalItems = items.filter((m) => m.status === 'historical')

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {activeItems.map((m) => (
          <MatchCard key={matchSlug(m.category.slug, m.toolA.slug, m.toolB.slug)} matchup={m} />
        ))}
      </div>

      {historicalItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Historical matches</h2>
            <span className="text-xs text-muted-foreground">
              No longer active in the last 28 days
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {historicalItems.map((m) => (
              <MatchCard
                key={matchSlug(m.category.slug, m.toolA.slug, m.toolB.slug)}
                matchup={m}
                historical
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MatchCard({
  matchup: m,
  historical = false,
}: {
  matchup: MatchItem
  historical?: boolean
}) {
  const slug = matchSlug(m.category.slug, m.toolA.slug, m.toolB.slug)
  const decisive = m.result.decisiveCaseCount
  const insufficient = !m.result.meetsPublicationThreshold

  return (
    <Card className={`transition-colors hover:bg-accent/50${historical ? ' opacity-80' : ''}`}>
      <Link href={`/matches/${slug}`}>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center gap-1.5">
            <Badge variant="secondary" className="text-xs">
              {m.category.name}
            </Badge>
            {historical && (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                Historical
              </Badge>
            )}
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

          {decisive > 0 ? (
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

          {insufficient && decisive > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {decisive} decisive case{decisive !== 1 ? 's' : ''} (30 needed)
            </p>
          )}
        </CardContent>
      </Link>
    </Card>
  )
}
