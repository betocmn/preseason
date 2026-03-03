import { MessageSquare } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { CommentaryFeed } from '~/components/public/commentary-feed'
import { EmptyState } from '~/components/public/empty-state'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Critics | Preseason',
  description: 'Verified critics who provide expert commentary on tool recommendations.',
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
          <h2 className="mb-4 text-xl font-bold tracking-tight">Verified Critics</h2>
          <CommentaryFeed comments={recentComments} />
        </div>
      )}
    </div>
  )
}
