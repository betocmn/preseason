import Link from 'next/link'
import { PercentageBar } from '~/components/public/percentage-bar'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { cn } from '~/lib/utils'

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
    <Card className={cn('transition-colors hover:bg-accent/50', className)}>
      <Link href={`/matches/${id}`}>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <Badge variant="secondary" className="text-xs">
              {category.name}
            </Badge>
            {isActive ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-trend-up" />
                LIVE
              </span>
            ) : (
              <Badge variant="outline" className="text-xs">
                SETTLED
              </Badge>
            )}
          </div>

          <div className="mb-3 flex items-center gap-1.5 text-sm font-medium">
            <Avatar className="h-5 w-5">
              {toolA.logoUrl && <AvatarImage src={toolA.logoUrl} alt={toolA.name} />}
              <AvatarFallback className="text-[10px]">
                {toolA.name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {toolA.name}
            <span className="text-muted-foreground">vs</span>
            <Avatar className="h-5 w-5">
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

          <div className="mt-2 text-xs text-muted-foreground">
            {periodStart} - {periodEnd}
          </div>
        </CardContent>
      </Link>
    </Card>
  )
}
