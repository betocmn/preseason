import Link from 'next/link'
import { PercentageBar } from '~/components/public/percentage-bar'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { cn, formatPeriod } from '~/lib/utils'

type MatchCardProps = {
  id: string
  status: 'active' | 'settled' | 'archived'
  toolA: { id: string; name: string; slug: string; logoUrl?: string | null }
  toolB: { id: string; name: string; slug: string; logoUrl?: string | null }
  category: { id: string; name: string; slug: string }
  toolAScore: number
  toolBScore: number
  winnerToolId: string | null
  periodStart: string
  periodEnd: string
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
    <Card className={cn('group transition-colors hover:bg-accent/50', className)}>
      <Link href={`/matches/${id}`}>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <Badge variant="secondary" className="text-xs">
              {category.name}
            </Badge>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden group-hover:inline">
                {formatPeriod(periodStart, periodEnd)}
              </span>
              <span className="hidden group-hover:inline text-border">·</span>
              {isActive ? (
                <span className="inline-flex items-center gap-1 font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-trend-up" />
                  LIVE
                </span>
              ) : (
                <Badge variant="outline" className="text-xs">
                  SETTLED
                </Badge>
              )}
            </div>
          </div>

          <div className="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <Avatar className="h-5 w-5 bg-muted">
              {toolA.logoUrl && <AvatarImage src={toolA.logoUrl} alt={toolA.name} />}
              <AvatarFallback className="text-[10px]">
                {toolA.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {toolA.name}
            <span className="text-muted-foreground">vs</span>
            <Avatar className="h-5 w-5 bg-muted">
              {toolB.logoUrl && <AvatarImage src={toolB.logoUrl} alt={toolB.name} />}
              <AvatarFallback className="text-[10px]">
                {toolB.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {toolB.name}
          </div>

          <PercentageBar
            valueA={toolAScore}
            valueB={toolBScore}
            labelA={toolA.name}
            labelB={toolB.name}
            size="sm"
          />

          {winnerToolId && (
            <p className="mt-2 text-xs font-medium text-foreground">
              Winner: {winnerToolId === toolA.id ? toolA.name : toolB.name}
            </p>
          )}
        </CardContent>
      </Link>
    </Card>
  )
}
