import type { Metadata } from 'next'
import { EmptyState } from '~/components/public/empty-state'
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
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Trending',
  description: 'See which tools are gaining or losing momentum in LLM recommendations.',
  openGraph: {
    title: 'Trending',
    description: 'See which tools are gaining or losing momentum in LLM recommendations.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trending',
    description: 'See which tools are gaining or losing momentum in LLM recommendations.',
  },
}

export default async function TrendingPage() {
  const caller = await api()
  const trending = await caller.recommendation.getTrending({
    currentWindowDays: 7,
    previousWindowDays: 7,
    limit: 50,
  })

  const items = trending.items

  return (
    <div className="container max-w-4xl py-8">
      <h1 className="mb-2 text-xl font-bold tracking-tight">Trending Tools</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Tools gaining or losing momentum over the past 7 days compared to the prior 7 days.
      </p>

      {items.length > 0 ? (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Tool</TableHead>
                <TableHead className="text-right">Current Rate</TableHead>
                <TableHead className="text-right">Previous Rate</TableHead>
                <TableHead className="text-right">Change</TableHead>
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
                  <TableCell className="font-mono-data text-right font-medium">
                    {(item.current.rate * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className="font-mono-data text-right text-muted-foreground">
                    {(item.previous.rate * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <TrendIndicator value={item.rateChange} size="sm" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyState
          title="No trending data yet"
          description="Trends appear after multiple LLM runs have completed across different time periods."
        />
      )}
    </div>
  )
}
