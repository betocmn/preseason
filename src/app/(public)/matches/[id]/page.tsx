import { TRPCError } from '@trpc/server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CommentList } from '~/components/public/comment-list'
import { MatchBreakdown } from '~/components/public/match-breakdown'
import { PercentageBar } from '~/components/public/percentage-bar'
import { ToolBadge } from '~/components/public/tool-badge'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { api } from '~/trpc/server'

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  try {
    const caller = await api()
    const { match } = await caller.match.getById({ id })
    return {
      title: `${match.toolA.name} vs ${match.toolB.name} | Preseason`,
      description: `Head-to-head match in ${match.category.name}: ${match.toolA.name} vs ${match.toolB.name}.`,
    }
  } catch {
    return { title: 'Match | Preseason' }
  }
}

export default async function MatchDetailPage({ params }: Props) {
  const { id } = await params
  const caller = await api()

  const matchData = await (async () => {
    try {
      return await caller.match.getById({ id })
    } catch (error) {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
      throw error
    }
  })()

  const { match, breakdown } = matchData
  const comments = await caller.comment.listByTarget({ targetType: 'match', targetId: id })

  const isActive = match.status === 'active'

  return (
    <div className="container max-w-4xl py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{match.category.name}</Badge>
          {isActive ? (
            <Badge variant="secondary" className="text-xs">
              <span className="mr-1 h-1.5 w-1.5 rounded-full bg-trend-up inline-block" />
              LIVE
            </Badge>
          ) : (
            <Badge variant="outline">SETTLED</Badge>
          )}
        </div>
        <h1 className="mb-4 text-2xl font-bold">
          {match.toolA.name} vs {match.toolB.name}
        </h1>

        <div className="mb-4 flex items-center gap-6">
          <ToolBadge name={match.toolA.name} slug={match.toolA.slug} />
          <span className="text-sm text-muted-foreground">vs</span>
          <ToolBadge name={match.toolB.name} slug={match.toolB.slug} />
        </div>

        <PercentageBar
          valueA={match.toolAScore}
          valueB={match.toolBScore}
          labelA={match.toolA.name}
          labelB={match.toolB.name}
          size="lg"
        />

        {match.winnerToolId && (
          <p className="mt-3 text-sm font-medium text-foreground">
            Winner: {match.winnerToolId === match.toolA.id ? match.toolA.name : match.toolB.name}
          </p>
        )}

        <p className="mt-2 text-xs text-muted-foreground">
          Period: {match.periodStart} - {match.periodEnd}
          {' | '}
          {breakdown.totals.recommendations} recommendations across {breakdown.totals.prompts}{' '}
          prompts
        </p>
      </div>

      {/* Breakdown */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <MatchBreakdown
            toolAName={match.toolA.name}
            toolBName={match.toolB.name}
            byLlm={breakdown.byLlm}
            byPrompt={breakdown.byPrompt}
          />
        </CardContent>
      </Card>

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
