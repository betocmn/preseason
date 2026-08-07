import Link from 'next/link'
import type { BenchmarkRankingItem } from '~/components/public/ranking-table'
import { ToolBadge } from '~/components/public/tool-badge'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
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
}

export function HomepageRankingsPreview({ previews }: HomepageRankingsPreviewProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {previews.map((preview) => {
        const href = `/rankings/${preview.groupSlug}/${preview.slug}`
        const items = preview.ranking?.items ?? []

        return (
          <Card key={preview.slug} className="border-border/60">
            <CardHeader className="space-y-2 pb-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">{preview.name}</CardTitle>
                {preview.ranking && !preview.ranking.meetsPublicationThreshold && (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    Insufficient data
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.length > 0 ? (
                <ol className="space-y-2">
                  {items.map((item, index) => (
                    <li
                      key={item.toolId}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="font-mono-data w-4 shrink-0 text-xs text-muted-foreground">
                          {index + 1}
                        </span>
                        <ToolBadge
                          name={item.toolName}
                          slug={item.toolSlug}
                          logoUrl={item.toolLogoUrl}
                          size="sm"
                        />
                      </div>
                      <span className="font-mono-data shrink-0 text-sm">
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
              <div className="pt-1">
                <Button variant="outline" size="sm" asChild className="w-full">
                  <Link
                    href={href}
                    aria-label={`View ${preview.name} rankings`}
                    className="text-xs text-muted-foreground"
                  >
                    View more &rarr;
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
