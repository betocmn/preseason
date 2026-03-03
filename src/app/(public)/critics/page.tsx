import { ArrowRight, MessageSquare, Users } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '~/components/public/empty-state'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { Separator } from '~/components/ui/separator'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Critics | Preseason',
  description: 'Verified critics who provide expert commentary on tool recommendations.',
}

function formatShortDate(date: Date | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}...`
}

export default async function CriticsPage() {
  const caller = await api()
  const critics = await caller.critic.listWithComments()

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Verified Critics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Expert voices providing commentary on tool recommendations and matches.
        </p>
      </div>

      {critics.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {critics.map((critic) => {
            const recentComments = critic.commentTargets.slice(0, 3)
            const totalComments = critic.commentTargets.length

            return (
              <Card key={critic.id} className="flex flex-col overflow-hidden">
                <div className="h-0.5 w-full bg-gradient-to-r from-[#7dd3fc] via-[#c4b5fd] to-[#6ee7b7] opacity-50" />
                <CardContent className="flex flex-1 flex-col p-4">
                  <Link href={`/critics/${critic.id}`} className="group flex items-start gap-3">
                    <Avatar className="h-10 w-10 ring-1 ring-border">
                      {critic.user.avatarUrl && (
                        <AvatarImage src={critic.user.avatarUrl} alt={critic.user.displayName} />
                      )}
                      <AvatarFallback className="text-xs font-medium">
                        {critic.user.displayName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-semibold group-hover:underline">
                        {critic.user.displayName}
                      </h3>
                      {critic.title && (
                        <p className="text-xs text-muted-foreground">{critic.title}</p>
                      )}
                      {critic.user.company && (
                        <p className="text-xs text-muted-foreground">@ {critic.user.company}</p>
                      )}
                    </div>
                  </Link>

                  {critic.expertiseAreas && critic.expertiseAreas.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {critic.expertiseAreas.slice(0, 3).map((area) => (
                        <Badge key={area} variant="secondary" className="px-1.5 py-0 text-[10px]">
                          {area}
                        </Badge>
                      ))}
                      {critic.expertiseAreas.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{critic.expertiseAreas.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {recentComments.length > 0 ? (
                    <>
                      <Separator className="my-3" />
                      <div className="flex-1 space-y-2.5">
                        {recentComments.map((ct) => (
                          <Link key={ct.id} href={ct.href} className="group/comment block">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="px-1.5 py-0 text-[10px] font-normal"
                              >
                                {ct.label}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {formatShortDate(ct.createdAt)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground group-hover/comment:text-foreground">
                              {truncate(ct.content, 90)}
                            </p>
                          </Link>
                        ))}
                      </div>

                      {totalComments > 3 && (
                        <Link
                          href={`/critics/${critic.id}`}
                          className="mt-3 inline-flex items-center gap-1 text-xs text-[#c4b5fd] hover:underline"
                        >
                          View all {totalComments} comments
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      )}
                    </>
                  ) : (
                    <>
                      <Separator className="my-3" />
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        No comments yet
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Users className="h-10 w-10" />}
          title="No verified critics yet"
          description="Verified critics provide expert commentary on tool recommendations."
        />
      )}
    </div>
  )
}
