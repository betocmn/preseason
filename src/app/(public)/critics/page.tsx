import { MessageSquare, Swords, Wrench } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '~/components/public/empty-state'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Separator } from '~/components/ui/separator'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Critics | Preseason',
  description: 'Verified critics who provide expert commentary on tool recommendations.',
}

function formatDate(date: Date | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength).trimEnd()}...`
}

const contextIcons = {
  match: Swords,
  tool: Wrench,
  recommendation: MessageSquare,
}

export default async function CriticsPage() {
  const caller = await api()
  const [critics, recentComments] = await Promise.all([
    caller.critic.listWithCount(),
    caller.comment.listRecent(),
  ])

  return (
    <div className="container py-8">
      {/* Critics compact grid */}
      <div className="mb-10">
        <h1 className="mb-4 text-xl font-bold tracking-tight">Verified Critics</h1>
        {critics.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {critics.map((critic) => (
              <Link
                key={critic.id}
                href={`/critics/${critic.id}`}
                className="group flex items-center gap-2.5 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  {critic.user.avatarUrl && (
                    <AvatarImage src={critic.user.avatarUrl} alt={critic.user.displayName} />
                  )}
                  <AvatarFallback className="text-[10px] font-medium">
                    {critic.user.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold group-hover:text-foreground">
                    {critic.user.displayName}
                  </p>
                  {(critic.title ?? critic.user.company) && (
                    <p className="truncate text-[10px] text-muted-foreground">
                      {critic.title ?? critic.user.company}
                    </p>
                  )}
                  {critic.commentCount > 0 && (
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {critic.commentCount} comment{critic.commentCount !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<MessageSquare className="h-8 w-8" />}
            title="No verified critics yet"
            description="Verified critics provide expert commentary on tool recommendations."
          />
        )}
      </div>

      {/* Recent commentary feed */}
      {recentComments.length > 0 && (
        <div>
          <h2 className="mb-4 text-xl font-bold tracking-tight">Recent Commentary</h2>
          <div className="space-y-0">
            {recentComments.map((comment, idx) => {
              const Icon = contextIcons[comment.context.type]

              return (
                <div key={comment.id}>
                  {idx > 0 && <Separator />}
                  <div className="py-4">
                    {/* Context + date row */}
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <Link
                        href={comment.context.href}
                        className="group/ctx flex items-center gap-1.5"
                      >
                        <span className="text-muted-foreground">
                          <Icon className="h-3 w-3" />
                        </span>
                        <span className="text-xs font-medium text-foreground/80 group-hover/ctx:text-foreground">
                          {comment.context.label}
                        </span>
                        {comment.context.sublabel && (
                          <>
                            <span className="text-xs text-muted-foreground/50">·</span>
                            <Badge
                              variant="outline"
                              className="px-1.5 py-0 text-[10px] font-normal"
                            >
                              {comment.context.sublabel}
                            </Badge>
                          </>
                        )}
                      </Link>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(comment.createdAt)}
                      </span>
                    </div>

                    {/* Comment text */}
                    <p className="mb-2 text-sm leading-relaxed text-foreground/90">
                      {truncate(comment.content, 280)}
                    </p>

                    {/* Critic attribution */}
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/critics/${comment.critic.id}`}
                        className="group/critic flex items-center gap-1.5"
                      >
                        <Avatar className="h-5 w-5">
                          {comment.critic.user.avatarUrl && (
                            <AvatarImage
                              src={comment.critic.user.avatarUrl}
                              alt={comment.critic.user.displayName}
                            />
                          )}
                          <AvatarFallback className="text-[8px]">
                            {comment.critic.user.displayName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-medium text-muted-foreground group-hover/critic:text-foreground">
                          {comment.critic.user.displayName}
                        </span>
                      </Link>
                      {comment.critic.title && (
                        <span className="text-xs text-muted-foreground">
                          · {comment.critic.title}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
