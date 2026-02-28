import Link from 'next/link'
import { PercentageBar } from '~/components/public/percentage-bar'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { cn } from '~/lib/utils'

type MatchCardProps = {
  id: string
  status: 'active' | 'settled' | 'archived'
  toolA: { id: string; name: string; slug: string }
  toolB: { id: string; name: string; slug: string }
  category: { id: string; name: string; slug: string }
  toolAScore: number
  toolBScore: number
  winnerToolId: string | null
  periodStart: string
  periodEnd: string | null
  className?: string
}

export function MatchCard({
  id,
  status,
  toolA,
  toolB,
  category,
  toolAScore,
  toolBScore,
  winnerToolId,
  periodStart,
  periodEnd,
  className,
}: MatchCardProps) {
  const isActive = status === 'active'

  return (
    <Card className={cn('transition-colors hover:bg-accent/50', className)}>
      <Link href={`/matches/${id}`}>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <Badge variant="secondary" className="text-xs">
              {category.name}
            </Badge>
            {isActive ? (
              <Badge className="bg-trend-up text-trend-up-foreground text-xs">ACTIVE</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                SETTLED
              </Badge>
            )}
          </div>

          <div className="mb-3 text-sm font-medium">
            {toolA.name} vs {toolB.name}
          </div>

          <PercentageBar
            valueA={toolAScore}
            valueB={toolBScore}
            labelA={toolA.name}
            labelB={toolB.name}
            size="sm"
          />

          {winnerToolId && (
            <p className="mt-2 text-xs text-trend-up">
              Winner: {winnerToolId === toolA.id ? toolA.name : toolB.name}
            </p>
          )}

          <div className="mt-2 text-xs text-muted-foreground">
            {periodStart}
            {periodEnd ? ` - ${periodEnd}` : ' - ongoing'}
          </div>
        </CardContent>
      </Link>
    </Card>
  )
}
