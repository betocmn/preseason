import { ToolBadge } from '~/components/public/tool-badge'
import { TrendIndicator } from '~/components/public/trend-indicator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { cn } from '~/lib/utils'

type RankingItem = {
  tool: { id: string; name: string; slug: string; logoUrl?: string | null }
  recommendationCount: number
  recommendationRate: number
  trend: number
  consistencyScore: number
  categoryCoverage?: number
  score?: number
}

type RankingTableProps = {
  items: RankingItem[]
  showCategoryCoverage?: boolean
  className?: string
}

export function RankingTable({ items, showCategoryCoverage, className }: RankingTableProps) {
  return (
    <div className={cn('rounded-md border', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Tool</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Trend</TableHead>
            <TableHead className="hidden text-right md:table-cell">Consistency</TableHead>
            {showCategoryCoverage && (
              <TableHead className="hidden text-right lg:table-cell">Categories</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => (
            <TableRow key={item.tool.id}>
              <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
              <TableCell>
                <ToolBadge
                  name={item.tool.name}
                  slug={item.tool.slug}
                  logoUrl={item.tool.logoUrl}
                />
              </TableCell>
              <TableCell className="text-right font-medium">
                {(item.recommendationRate * 100).toFixed(1)}%
              </TableCell>
              <TableCell className="text-right">
                <TrendIndicator value={item.trend} size="sm" />
              </TableCell>
              <TableCell className="hidden text-right md:table-cell">
                {(item.consistencyScore * 100).toFixed(0)}%
              </TableCell>
              {showCategoryCoverage && (
                <TableCell className="hidden text-right lg:table-cell">
                  {item.categoryCoverage ?? 0}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
