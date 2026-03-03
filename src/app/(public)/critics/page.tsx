import { MessageSquare, Users } from 'lucide-react'
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

type CommentTarget = {
  id: string
  targetType: string
  label: string
  href: string
  createdAt: Date | null
}

function groupCommentsByLabel(commentTargets: CommentTarget[]) {
  const groups = new Map<
    string,
    { label: string; entries: { id: string; href: string; createdAt: Date | null }[] }
  >()

  for (const ct of commentTargets) {
    const existing = groups.get(ct.label)
    if (existing) {
      existing.entries.push({ id: ct.id, href: ct.href, createdAt: ct.createdAt })
    } else {
      groups.set(ct.label, {
        label: ct.label,
        entries: [{ id: ct.id, href: ct.href, createdAt: ct.createdAt }],
      })
    }
  }

  return [...groups.values()]
}

export default async function CriticsPage() {
  const caller = await api()
  const critics = await caller.critic.listWithComments()

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Verified Critics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Expert voices providing commentary on tool recommendations and matches.
        </p>
      </div>

      {critics.length > 0 ? (
        <div className="space-y-4">
          {critics.map((critic) => {
            const grouped = groupCommentsByLabel(critic.commentTargets)

            return (
              <Card key={critic.id} className="overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-[#7dd3fc] via-[#c4b5fd] to-[#6ee7b7] opacity-60" />
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12 ring-2 ring-border">
                      {critic.user.avatarUrl && (
                        <AvatarImage src={critic.user.avatarUrl} alt={critic.user.displayName} />
                      )}
                      <AvatarFallback className="text-sm font-medium">
                        {critic.user.displayName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <h3 className="text-base font-semibold">{critic.user.displayName}</h3>
                        {critic.user.company && (
                          <span className="text-sm text-muted-foreground">
                            @ {critic.user.company}
                          </span>
                        )}
                      </div>
                      {critic.title && (
                        <p className="text-sm text-muted-foreground">{critic.title}</p>
                      )}
                      {critic.expertiseAreas && critic.expertiseAreas.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {critic.expertiseAreas.map((area) => (
                            <Badge key={area} variant="secondary" className="text-xs">
                              {area}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {grouped.length > 0 && (
                    <>
                      <Separator className="my-4" />
                      <div>
                        <div className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Comments
                        </div>
                        <div className="space-y-2">
                          {grouped.map((group) => (
                            <div
                              key={group.label}
                              className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
                            >
                              <span className="text-sm font-medium text-foreground">
                                {group.label}
                              </span>
                              <span className="text-muted-foreground">—</span>
                              {group.entries.map((entry, i) => (
                                <span key={entry.id} className="inline-flex items-center">
                                  <Link
                                    href={entry.href}
                                    className="text-sm text-[#c4b5fd] underline-offset-2 hover:underline dark:text-[#c4b5fd]"
                                  >
                                    {formatShortDate(entry.createdAt)}
                                  </Link>
                                  {i < group.entries.length - 1 && (
                                    <span className="ml-2 text-xs text-muted-foreground/50">·</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
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
