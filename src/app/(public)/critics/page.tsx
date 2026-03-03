import { MessageSquare } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '~/components/public/empty-state'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
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

function ToolLogo({ url, name, size = 5 }: { url: string | null; name: string; size?: number }) {
  return (
    <Avatar className={`h-${size} w-${size} ring-1 ring-border`}>
      {url && <AvatarImage src={url} alt={name} />}
      <AvatarFallback className="bg-secondary text-[8px]">
        {name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {critics.map((critic) => (
              <Link
                key={critic.id}
                href={`/critics/${critic.id}`}
                className="group flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3 transition-colors hover:bg-secondary/60"
              >
                <Avatar className="h-9 w-9 shrink-0 ring-2 ring-border">
                  {critic.user.avatarUrl && (
                    <AvatarImage src={critic.user.avatarUrl} alt={critic.user.displayName} />
                  )}
                  <AvatarFallback className="bg-secondary text-[10px] font-semibold">
                    {critic.user.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold">{critic.user.displayName}</p>
                  {(critic.title || critic.user.company) && (
                    <p className="truncate text-[10px] text-muted-foreground">
                      {critic.title && <span>{critic.title}</span>}
                      {critic.title && critic.user.company && <span> @ </span>}
                      {critic.user.company && (
                        <span className="font-semibold text-muted-foreground">
                          {critic.user.company}
                        </span>
                      )}
                    </p>
                  )}
                  {critic.commentCount > 0 && (
                    <p className="mt-0.5 text-[10px] font-medium" style={{ color: '#c4b5fd' }}>
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
          <div className="space-y-2">
            {recentComments.map((comment) => {
              const [logoA, logoB] = comment.context.logos

              return (
                <div
                  key={comment.id}
                  className="group relative overflow-hidden rounded-lg border border-border bg-secondary/20 transition-colors hover:bg-secondary/60"
                >
                  <div className="relative z-0 flex flex-col gap-3 p-4">
                    {/* Context header */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                        {logoA && logoB ? (
                          // Match: logo next to each tool name
                          <>
                            <ToolLogo url={logoA.url} name={logoA.name} />
                            <span className="truncate">{logoA.name}</span>
                            <span className="shrink-0 text-xs font-normal text-muted-foreground">
                              vs
                            </span>
                            <ToolLogo url={logoB.url} name={logoB.name} />
                            <span className="truncate">{logoB.name}</span>
                          </>
                        ) : logoA ? (
                          // Single tool / recommendation
                          <>
                            <ToolLogo url={logoA.url} name={logoA.name} />
                            <span className="truncate">{comment.context.label}</span>
                          </>
                        ) : (
                          <span className="truncate">{comment.context.label}</span>
                        )}
                        {comment.context.sublabel && (
                          <Badge
                            variant="secondary"
                            className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
                          >
                            {comment.context.sublabel}
                          </Badge>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(comment.createdAt)}
                      </span>
                    </div>

                    {/* Comment text */}
                    <p className="text-sm leading-relaxed text-foreground/75">
                      &ldquo;{truncate(comment.content, 220)}&rdquo;
                    </p>

                    {/* Critic attribution */}
                    <div className="flex items-center gap-2 border-t border-border/40 pt-2">
                      <Link
                        href={`/critics/${comment.critic.id}`}
                        className="relative z-20 flex items-center gap-1.5 hover:underline"
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
                        <span className="text-xs font-medium text-muted-foreground">
                          {comment.critic.user.displayName}
                        </span>
                      </Link>
                      {comment.critic.title && (
                        <span className="text-xs text-muted-foreground/60">
                          · {comment.critic.title}
                        </span>
                      )}
                      {comment.critic.user.company && (
                        <span className="text-xs text-muted-foreground/60">
                          @{' '}
                          <span className="font-semibold text-muted-foreground">
                            {comment.critic.user.company}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Card-level link — sits above content (z-10) so clicks navigate, critic link uses z-20 to stay clickable */}
                  <Link
                    href={comment.context.href}
                    className="absolute inset-0 z-10"
                    aria-label={comment.context.label}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
