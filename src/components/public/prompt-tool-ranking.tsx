'use client'

import * as React from 'react'
import { ToolBadge } from '~/components/public/tool-badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

type ToolSummary = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
}

type SubcategorySummary = {
  id: string
  name: string
  slug: string
  displayOrder: number
}

type ToolRanking = {
  tool: ToolSummary
  totalCount: number
  perCategory: Array<{ categoryId: string; count: number }>
}

type PromptToolRankingProps = {
  subcategories: SubcategorySummary[]
  rankings: ToolRanking[]
  maxDisplay?: number
}

const ALL_VALUE = 'all'

export function PromptToolRanking({
  subcategories,
  rankings,
  maxDisplay = 30,
}: PromptToolRankingProps) {
  const [selectedCategory, setSelectedCategory] = React.useState(ALL_VALUE)

  const sorted = React.useMemo(() => {
    return rankings
      .map((ranking) => {
        const count =
          selectedCategory === ALL_VALUE
            ? ranking.totalCount
            : (ranking.perCategory.find((entry) => entry.categoryId === selectedCategory)?.count ??
              0)
        return { ranking, count }
      })
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [rankings, selectedCategory])

  const totalForRate = sorted.reduce((sum, row) => sum + row.count, 0)
  const displayed = sorted.slice(0, maxDisplay)

  if (rankings.length === 0) return null

  return (
    <Card className="mb-6 mt-6">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Tool Rankings</CardTitle>
          {subcategories.length > 0 && (
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="h-8 w-[220px] text-xs" aria-label="Filter by subcategory">
                <SelectValue placeholder="All subcategories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All subcategories</SelectItem>
                {subcategories.map((subcategory) => (
                  <SelectItem key={subcategory.id} value={subcategory.id}>
                    {subcategory.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {displayed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tool recommendations for this subcategory.
          </p>
        ) : (
          <ol className="space-y-2">
            {displayed.map((row, index) => {
              const pct = totalForRate > 0 ? (row.count / totalForRate) * 100 : 0
              return (
                <li key={row.ranking.tool.id} className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="w-36 shrink-0">
                    <ToolBadge
                      name={row.ranking.tool.name}
                      slug={row.ranking.tool.slug}
                      logoUrl={row.ranking.tool.logoUrl}
                      size="sm"
                    />
                  </div>
                  <div className="flex flex-1 items-center gap-2">
                    <div className="h-1.5 w-full max-w-32 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-muted-foreground/30 transition-all"
                        style={{ width: `${Math.max(pct, 3)}%` }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
