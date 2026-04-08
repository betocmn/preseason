'use client'

import { MessageSquare } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { EmptyState } from '~/components/public/empty-state'
import { LoadMoreButton } from '~/components/public/load-more-button'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { api, type RouterOutputs } from '~/trpc/react'

const PAGE_SIZE = 12

type CriticItem = RouterOutputs['critic']['listWithCount']['items'][number]

type CriticsGridProps = {
  initialItems: CriticItem[]
  initialTotal: number
}

export function CriticsGrid({ initialItems, initialTotal }: CriticsGridProps) {
  const [offset, setOffset] = useState(0)
  const [items, setItems] = useState<CriticItem[]>(initialItems)
  const [total, setTotal] = useState(initialTotal)

  const { data, isFetching } = api.critic.listWithCount.useQuery(
    { limit: PAGE_SIZE, offset },
    { enabled: offset > 0 },
  )

  useEffect(() => {
    if (!data || offset === 0) return

    setTotal(data.total)
    setItems((prev) => {
      const existingIds = new Set(prev.map((critic) => critic.id))
      const next = data.items.filter((critic) => !existingIds.has(critic.id))
      return [...prev, ...next]
    })
  }, [data, offset])

  const hasMore = items.length < total

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-8 w-8" />}
        title="No verified critics yet"
        description="Verified critics provide expert commentary on tool recommendations."
      />
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {items.map((critic) => (
          <Link
            key={critic.id}
            href={`/critics/${critic.slug}`}
            className="group flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3 transition-colors hover:bg-secondary/60"
          >
            <Avatar className="h-9 w-9 shrink-0 ring-2 ring-border">
              {critic.user.avatarUrl && (
                <AvatarImage src={critic.user.avatarUrl} alt={critic.user.displayName} size={36} />
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

      <LoadMoreButton
        onLoadMore={() => setOffset(items.length)}
        hasMore={hasMore}
        isLoading={isFetching}
      />
    </>
  )
}
