import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import type { BenchmarkRankingItem } from '~/components/public/ranking-table'
import { ToolBadge } from '~/components/public/tool-badge'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

export type HomepageRankingPreview = {
  slug: string
  name: string
  groupSlug: string
  ranking: {
    items: BenchmarkRankingItem[]
    totalEligibleDecisions: number
    meetsPublicationThreshold: boolean
  } | null
}

type HomepageRankingsPreviewProps = {
  previews: HomepageRankingPreview[]
  queryString?: string
}

export function HomepageRankingsPreview({ previews, queryString }: HomepageRankingsPreviewProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {previews.map((preview) => {
        const href = `/rankings/${preview.groupSlug}/${preview.slug}${queryString ? `?${queryString}` : ''}`
        const items = preview.ranking?.items ?? []

        return (
          <Card key={preview.slug} className="rounded-xl border-border/80">
            <CardHeader className="space-y-2 p-4 pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="min-w-0 flex-1 text-sm">
                  <Link
                    href={href}
                    aria-label={`View ${preview.name} rankings`}
                    className="group flex items-center justify-between gap-3 hover:text-primary"
                  >
                    {preview.name}
                    <ArrowUpRight
                      className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </Link>
                </CardTitle>
                {preview.ranking && !preview.ranking.meetsPublicationThreshold && (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    Insufficient data
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {items.length > 0 ? (
                <ol className="divide-y divide-border/60">
                  {items.map((item, index) => (
                    <li key={item.toolId} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="font-mono-data w-4 shrink-0 text-xs text-muted-foreground">
                          {index + 1}
                        </span>
                        <ToolBadge
                          name={item.toolName}
                          slug={item.toolSlug}
                          logoUrl={item.toolLogoUrl}
                          size="sm"
                          className="text-sm"
                          imageLoading="lazy"
                        />
                      </div>
                      <span
                        className="font-mono-data shrink-0 text-sm"
                        title="Weighted recommendation rate"
                      >
                        {(item.weightedSupportRate * 100).toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Rankings will appear once published benchmark runs are available.
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
