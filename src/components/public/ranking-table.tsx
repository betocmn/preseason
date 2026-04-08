import { CiBar } from '~/components/public/ci-bar'
import { ToolBadge } from '~/components/public/tool-badge'
import { TrendIndicator } from '~/components/public/trend-indicator'
import { Badge } from '~/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { cn } from '~/lib/utils'

export type BenchmarkRankingItem = {
  toolId: string
  toolName: string
  toolSlug: string
  toolLogoUrl: string | null
  weightedSupportRate: number
  rawSupportCount: number
  rawEligibleCount: number
  rawSupportRate: number
  ciLow: number
  ciHigh: number
  trend: number
  modelCoverage: number
  promptCoverage: number
}

type RankingTableProps = {
  items: BenchmarkRankingItem[]
  meetsPublicationThreshold?: boolean
  className?: string
}

export function RankingTable({
  items,
  meetsPublicationThreshold = true,
  className,
}: RankingTableProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {!meetsPublicationThreshold && (
        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-4 py-3">
          <Badge variant="outline" className="text-xs">
            Insufficient data
          </Badge>
          <span className="text-sm text-muted-foreground">
            This category does not yet meet the minimum benchmark data thresholds for authoritative
            rankings.
          </span>
        </div>
      )}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Tool</TableHead>
              <TableHead className="text-right">Support Rate</TableHead>
              <TableHead className="hidden text-right md:table-cell">95% CI</TableHead>
              <TableHead className="text-right">Trend</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Models</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Prompts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => (
              <TableRow key={item.toolId}>
                <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                <TableCell>
                  <ToolBadge name={item.toolName} slug={item.toolSlug} logoUrl={item.toolLogoUrl} />
                </TableCell>
                <TableCell className="font-mono-data text-right font-medium">
                  {(item.weightedSupportRate * 100).toFixed(1)}%
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({item.rawSupportCount}/{item.rawEligibleCount})
                  </span>
                </TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-mono-data text-xs text-muted-foreground">
                      {(item.ciLow * 100).toFixed(0)}-{(item.ciHigh * 100).toFixed(0)}%
                    </span>
                    <CiBar low={item.ciLow} high={item.ciHigh} />
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <TrendIndicator value={item.trend} size="sm" />
                </TableCell>
                <TableCell className="font-mono-data hidden text-right lg:table-cell">
                  {(item.modelCoverage * 100).toFixed(0)}%
                </TableCell>
                <TableCell className="font-mono-data hidden text-right lg:table-cell">
                  {(item.promptCoverage * 100).toFixed(0)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
