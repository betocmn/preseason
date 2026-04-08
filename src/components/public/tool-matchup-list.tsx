import Link from 'next/link'
import { PercentageBar } from '~/components/public/percentage-bar'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

type Matchup = {
  category: { id: string; name: string; slug: string }
  toolA: { id: string; name: string; slug: string; logoUrl: string | null }
  toolB: { id: string; name: string; slug: string; logoUrl: string | null }
  result: {
    aWins: number
    bWins: number
    decisiveCaseCount: number
    meetsPublicationThreshold: boolean
  }
}

type ToolMatchupListProps = {
  matchups: Matchup[]
}

function matchSlug(categorySlug: string, toolASlug: string, toolBSlug: string) {
  return `${categorySlug}--${toolASlug}-vs-${toolBSlug}`
}

export function ToolMatchupList({ matchups }: ToolMatchupListProps) {
  if (matchups.length === 0) return null

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Head-to-Head Matchups</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {matchups.map((m) => {
            const slug = matchSlug(m.category.slug, m.toolA.slug, m.toolB.slug)
            const decisive = m.result.decisiveCaseCount
            const insufficient = !m.result.meetsPublicationThreshold

            return (
              <Card key={slug} className="transition-colors hover:bg-accent/50">
                <Link href={`/matches/${slug}`}>
                  <CardContent className="p-4">
                    <div className="mb-2">
                      <Badge variant="secondary" className="text-xs">
                        {m.category.name}
                      </Badge>
                    </div>

                    <div className="mb-3 flex items-center gap-1.5 text-sm font-medium">
                      <Avatar className="h-5 w-5 bg-muted-foreground/25 ring-2 ring-muted-foreground/40">
                        {m.toolA.logoUrl && (
                          <AvatarImage src={m.toolA.logoUrl} alt={m.toolA.name} size={20} />
                        )}
                        <AvatarFallback className="text-[10px]">
                          {m.toolA.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{m.toolA.name}</span>
                      <span className="text-muted-foreground">vs</span>
                      <Avatar className="h-5 w-5 bg-muted-foreground/25 ring-2 ring-muted-foreground/40">
                        {m.toolB.logoUrl && (
                          <AvatarImage src={m.toolB.logoUrl} alt={m.toolB.name} size={20} />
                        )}
                        <AvatarFallback className="text-[10px]">
                          {m.toolB.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{m.toolB.name}</span>
                    </div>

                    {decisive > 0 ? (
                      <PercentageBar
                        valueA={m.result.aWins}
                        valueB={m.result.bWins}
                        labelA={m.toolA.name}
                        labelB={m.toolB.name}
                        size="sm"
                      />
                    ) : (
                      <p className="text-xs text-muted-foreground">No decisive cases yet</p>
                    )}

                    {insufficient && decisive > 0 && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {decisive} decisive case{decisive !== 1 ? 's' : ''} (30 needed)
                      </p>
                    )}
                  </CardContent>
                </Link>
              </Card>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
