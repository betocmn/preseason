import { TRPCError } from '@trpc/server'
import { CheckCircle, ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CategoryPill } from '~/components/public/category-pill'
import { CommentList } from '~/components/public/comment-list'
import { MatchCard } from '~/components/public/match-card'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { api } from '~/trpc/server'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const caller = await api()
    const tool = await caller.tool.getBySlug({ slug })
    return {
      title: `${tool.name} | Preseason`,
      description: tool.description ?? `See how LLMs recommend ${tool.name}.`,
    }
  } catch {
    return { title: 'Tool | Preseason' }
  }
}

export default async function ToolDetailPage({ params }: Props) {
  const { slug } = await params
  const caller = await api()

  const tool = await (async () => {
    try {
      return await caller.tool.getBySlug({ slug })
    } catch (error) {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
      throw error
    }
  })()

  const [stats, activeMatches, comments] = await Promise.all([
    caller.recommendation.getStats({ days: 30 }),
    caller.match.listActive(),
    caller.comment.listByTarget({ targetType: 'tool', targetId: tool.id }),
  ])

  const toolStats = stats.items.filter((item) => item.tool.id === tool.id)
  const toolMatches = activeMatches.filter((m) => m.toolA.id === tool.id || m.toolB.id === tool.id)

  const toolCategories = tool.toolCategories?.map((tc) => tc.category) ?? []

  return (
    <div className="container max-w-4xl py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{tool.name}</h1>
          {tool.isVerified && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <CheckCircle className="h-3 w-3" />
              Verified
            </Badge>
          )}
        </div>

        {tool.description && <p className="mb-3 text-muted-foreground">{tool.description}</p>}

        <div className="mb-3 flex flex-wrap gap-2">
          {toolCategories.map((cat) => (
            <CategoryPill
              key={cat.id}
              name={cat.name}
              slug={cat.slug}
              groupSlug={cat.categoryGroup?.slug}
            />
          ))}
        </div>

        {tool.website && (
          <Button variant="outline" size="sm" asChild>
            <Link href={tool.website} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3 w-3" />
              Website
            </Link>
          </Button>
        )}
      </div>

      {/* Stats */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Recommendation Stats (30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {toolStats.length > 0 ? (
            <div className="space-y-3">
              {toolStats.map((stat) => (
                <div key={stat.category.id} className="flex items-center justify-between">
                  <CategoryPill
                    name={stat.category.name}
                    slug={stat.category.slug}
                    groupSlug={stat.category.groupSlug}
                  />
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium">
                      {(stat.rate * 100).toFixed(1)}% rate
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {stat.recommendationCount} recs
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No recommendation data for this tool yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Active Matches */}
      {toolMatches.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">Active Matches</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {toolMatches.map((match) => (
              <MatchCard
                key={match.id}
                id={match.id}
                status={match.status}
                toolA={match.toolA}
                toolB={match.toolB}
                category={match.category}
                toolAScore={match.toolAScore}
                toolBScore={match.toolBScore}
                winnerToolId={match.winnerToolId}
                periodStart={match.periodStart}
                periodEnd={match.periodEnd}
              />
            ))}
          </div>
        </div>
      )}

      {/* Comments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comments</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentList comments={comments} />
        </CardContent>
      </Card>
    </div>
  )
}
