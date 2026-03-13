'use client'

import Link from 'next/link'
import { EmptyState } from '~/components/public/empty-state'
import { PercentageBar } from '~/components/public/percentage-bar'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { api } from '~/trpc/react'

type MatchesPageContentProps = {
  initialCategorySlug?: string
}

function matchSlug(categorySlug: string, toolASlug: string, toolBSlug: string) {
  return `${categorySlug}--${toolASlug}-vs-${toolBSlug}`
}

export function MatchesPageContent({ initialCategorySlug }: MatchesPageContentProps) {
  const { data: matchups, isLoading } = api.benchmarkMatch.listFeatured.useQuery(
    initialCategorySlug ? { categorySlug: initialCategorySlug } : undefined,
  )

  if (isLoading) return null

  const items = matchups ?? []

  if (items.length === 0) {
    return (
      <EmptyState
        title="No benchmark matchups yet"
        description="Head-to-head matchups are generated from benchmark ranking data. Check back after benchmark runs have completed."
      />
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((m) => {
        const slug = matchSlug(m.category.slug, m.toolA.slug, m.toolB.slug)
        const decisive = m.result.decisiveCaseCount
        const insufficient = !m.result.meetsPublicationThreshold

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
                  <Avatar className="h-5 w-5 bg-muted">
                    {m.toolA.logoUrl && <AvatarImage src={m.toolA.logoUrl} alt={m.toolA.name} />}
                    <AvatarFallback className="text-[10px]">
                      {m.toolA.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {m.toolA.name}
                  <span className="text-muted-foreground">vs</span>
                  <Avatar className="h-5 w-5 bg-muted">
                    {m.toolB.logoUrl && <AvatarImage src={m.toolB.logoUrl} alt={m.toolB.name} />}
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
      })}
    </div>
  )
}
