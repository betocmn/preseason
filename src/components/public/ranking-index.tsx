import Link from 'next/link'
import type { BenchmarkRankingItem } from '~/components/public/ranking-table'
import { ToolBadge } from '~/components/public/tool-badge'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

type RankingIndexGroup = {
  slug: string
  name: string
  ranking: {
    items: BenchmarkRankingItem[]
    totalEligibleDecisions: number
    meetsPublicationThreshold: boolean
  } | null
}

type RankingIndexProps = {
  groups: RankingIndexGroup[]
}

export function RankingIndex({ groups }: RankingIndexProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => {
        const topItems = group.ranking?.items.slice(0, 3) ?? []

        return (
          <Card key={group.slug} className="border-border/60">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{group.name}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {group.ranking
                      ? `${group.ranking.totalEligibleDecisions} eligible benchmark decisions`
                      : 'No published benchmark decisions yet'}
                  </p>
                </div>
                <Link
                  href={`/rankings/${group.slug}`}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  View
                </Link>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  Benchmark
                </Badge>
                {group.ranking && !group.ranking.meetsPublicationThreshold && (
                  <Badge variant="outline" className="text-xs">
                    Insufficient data
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {topItems.length > 0 ? (
                <div className="space-y-3">
                  {topItems.map((item, index) => (
                    <div
                      key={item.toolId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono-data text-xs text-muted-foreground">
                          {index + 1}
                        </span>
                        <ToolBadge
                          name={item.toolName}
                          slug={item.toolSlug}
                          logoUrl={item.toolLogoUrl}
                          size="sm"
                        />
                      </div>
                      <span className="font-mono-data text-sm">
                        {(item.weightedSupportRate * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Benchmark rankings will appear here once published runs are available for this
                  category group.
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
