import Link from 'next/link'
import { CiBar } from '~/components/public/ci-bar'
import { TrendIndicator } from '~/components/public/trend-indicator'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'

type ToolCategoryRanking = {
  category: { id: string; name: string; slug: string; groupSlug: string }
  rank: number
  totalTools: number
  weightedSupportRate: number
  rawSupportCount: number
  rawEligibleCount: number
  ciLow: number
  ciHigh: number
  trend: number
  meetsPublicationThreshold: boolean
}

type ToolRankingSummaryProps = {
  rankings: ToolCategoryRanking[]
}

export function ToolRankingSummary({ rankings }: ToolRankingSummaryProps) {
  if (rankings.length === 0) return null

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Rankings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Rank</TableHead>
                <TableHead className="text-right">Support Rate</TableHead>
                <TableHead className="hidden text-right md:table-cell">95% CI</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rankings.map((r) => (
                <TableRow key={r.category.id}>
                  <TableCell>
                    <Link
                      href={`/rankings/${r.category.groupSlug}/${r.category.slug}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {r.category.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className="font-mono-data text-xs">
                      #{r.rank}
                      <span className="text-muted-foreground">/{r.totalTools}</span>
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono-data text-right font-medium">
                    {(r.weightedSupportRate * 100).toFixed(1)}%
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({r.rawSupportCount}/{r.rawEligibleCount})
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-right md:table-cell">
                    <div className="flex items-center justify-end gap-2">
                      <span className="font-mono-data text-xs text-muted-foreground">
                        {(r.ciLow * 100).toFixed(0)}-{(r.ciHigh * 100).toFixed(0)}%
                      </span>
                      <CiBar low={r.ciLow} high={r.ciHigh} />
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-right lg:table-cell">
                    <TrendIndicator value={r.trend} size="sm" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
