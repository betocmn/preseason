import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PercentageBar } from '~/components/public/percentage-bar'
import { ToolBadge } from '~/components/public/tool-badge'
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
import { api } from '~/trpc/server'

type Props = {
  params: Promise<{ slug: string }>
}

function parseMatchSlug(slug: string) {
  const separatorIndex = slug.indexOf('--')
  if (separatorIndex === -1) return null

  const categorySlug = slug.slice(0, separatorIndex)
  const rest = slug.slice(separatorIndex + 2)
  const vsIndex = rest.indexOf('-vs-')
  if (vsIndex === -1) return null

  const toolASlug = rest.slice(0, vsIndex)
  const toolBSlug = rest.slice(vsIndex + 4)
  if (!categorySlug || !toolASlug || !toolBSlug) return null

  return { categorySlug, toolASlug, toolBSlug }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const parsed = parseMatchSlug(slug)
  if (!parsed) return { title: 'Match Not Found' }

  const caller = await api()
  const data = await caller.benchmarkMatch.headToHead(parsed)

  if (!data.toolA || !data.toolB) return { title: 'Match Not Found' }

  const title = `${data.toolA.name} vs ${data.toolB.name}`
  const categoryName = data.category?.name ?? 'category'
  const description = `Benchmark head-to-head in ${categoryName}: ${data.toolA.name} vs ${data.toolB.name}.`
  return {
    title,
    description,
    openGraph: { title, description, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function MatchDetailPage({ params }: Props) {
  const { slug } = await params
  const parsed = parseMatchSlug(slug)
  if (!parsed) notFound()

  const caller = await api()
  const data = await caller.benchmarkMatch.headToHead(parsed)

  if (!data.category || !data.toolA || !data.toolB) {
    notFound()
  }

  const { category, toolA, toolB, result } = data
  const hasResult = !!result
  const decisive = result?.decisiveCaseCount ?? 0
  const insufficient = hasResult && !result.meetsPublicationThreshold

  return (
    <div className="container max-w-4xl py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{category.name}</Badge>
          <Badge variant="secondary" className="text-xs">
            Benchmark
          </Badge>
          <Link
            href="/methodology"
            className="ml-auto text-sm text-muted-foreground hover:text-foreground"
          >
            Methodology
          </Link>
        </div>
        <h1 className="mb-4 text-2xl font-bold">
          {toolA.name} vs {toolB.name}
        </h1>

        <div className="mb-4 flex items-center gap-6">
          <ToolBadge name={toolA.name} slug={toolA.slug} logoUrl={toolA.logoUrl} />
          <span className="text-sm text-muted-foreground">vs</span>
          <ToolBadge name={toolB.name} slug={toolB.slug} logoUrl={toolB.logoUrl} />
        </div>

        {hasResult && decisive > 0 ? (
          <>
            <PercentageBar
              valueA={result.aWins}
              valueB={result.bWins}
              labelA={toolA.name}
              labelB={toolB.name}
              size="lg"
            />

            {result.aWinRate > result.bWinRate && (
              <p className="mt-3 text-sm font-medium text-foreground">
                Leading: {toolA.name} ({(result.aWinRate * 100).toFixed(1)}%)
              </p>
            )}
            {result.bWinRate > result.aWinRate && (
              <p className="mt-3 text-sm font-medium text-foreground">
                Leading: {toolB.name} ({(result.bWinRate * 100).toFixed(1)}%)
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No decisive benchmark cases yet.</p>
        )}

        {insufficient && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-4 py-3">
            <Badge variant="outline" className="text-xs">
              Insufficient data
            </Badge>
            <span className="text-sm text-muted-foreground">
              This matchup has {decisive} decisive case{decisive !== 1 ? 's' : ''} (minimum 30
              required for publication).
            </span>
          </div>
        )}
      </div>

      {/* Stats */}
      {hasResult && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">{toolA.name} wins</TableCell>
                    <TableCell className="font-mono-data text-right">{result.aWins}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">{toolB.name} wins</TableCell>
                    <TableCell className="font-mono-data text-right">{result.bWins}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Abstains (no tool)</TableCell>
                    <TableCell className="font-mono-data text-right">{result.abstains}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Other tool chosen</TableCell>
                    <TableCell className="font-mono-data text-right">
                      {result.otherToolCount}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Decisive cases</TableCell>
                    <TableCell className="font-mono-data text-right">
                      {result.decisiveCaseCount}
                    </TableCell>
                  </TableRow>
                  {decisive > 0 && (
                    <>
                      <TableRow>
                        <TableCell className="font-medium">
                          {toolA.name} win rate (unweighted)
                        </TableCell>
                        <TableCell className="font-mono-data text-right">
                          {(result.aWinRate * 100).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">95% CI</TableCell>
                        <TableCell className="font-mono-data text-right">
                          {(result.ciLow * 100).toFixed(1)}% - {(result.ciHigh * 100).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">
                          {toolA.name} win rate (weighted)
                        </TableCell>
                        <TableCell className="font-mono-data text-right">
                          {(result.weightedAWinRate * 100).toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
