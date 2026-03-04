'use client'

import { ToolBadge } from '~/components/public/tool-badge'
import { Badge } from '~/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table'
import { api } from '~/trpc/react'

type Props = {
  promptId: string
}

export function PromptTopRecommendations({ promptId }: Props) {
  const { data, isLoading } = api.recommendation.topToolsByPrompt.useQuery({
    promptId,
    limit: 5,
  })

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading recommendations...</p>
  }

  const groups = data?.groups ?? []

  if (groups.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No recommendations have been generated for this prompt yet.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.subcategory.id}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold">{group.subcategory.name}</h3>
            <Badge variant="outline" className="text-xs">
              {group.subcategory.groupName}
            </Badge>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Tool</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Consistency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.tools.map((item, index) => (
                  <TableRow key={item.tool.id}>
                    <TableCell className="font-medium text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>
                      <ToolBadge
                        name={item.tool.name}
                        slug={item.tool.slug}
                        logoUrl={item.tool.logoUrl}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="font-mono-data text-right">
                      {item.recommendationCount}
                    </TableCell>
                    <TableCell className="font-mono-data text-right font-medium">
                      {(item.recommendationRate * 100).toFixed(1)}%
                    </TableCell>
                    <TableCell className="font-mono-data hidden text-right md:table-cell">
                      {(item.consistencyScore * 100).toFixed(0)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  )
}
