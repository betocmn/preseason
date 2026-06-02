'use client'

import { useEffect, useState } from 'react'
import { CommentaryFeed } from '~/components/public/commentary-feed'
import { LoadMoreButton } from '~/components/public/load-more-button'
import { api, type RouterOutputs } from '~/trpc/react'

const PAGE_SIZE = 10

type RecentCommentaryItem = RouterOutputs['comment']['listRecent']['items'][number]

type RecentCommentaryListProps = {
  initialItems: RecentCommentaryItem[]
  initialTotal: number
}

export function RecentCommentaryList({ initialItems, initialTotal }: RecentCommentaryListProps) {
  const [offset, setOffset] = useState(0)
  const [items, setItems] = useState<RecentCommentaryItem[]>(initialItems)
  const [total, setTotal] = useState(initialTotal)

  const { data, isFetching } = api.comment.listRecent.useQuery(
    { limit: PAGE_SIZE, offset },
    { enabled: offset > 0 },
  )

  useEffect(() => {
    if (!data || offset === 0) return

    setTotal(data.total)
    setItems((prev) => {
      const existingIds = new Set(prev.map((comment) => comment.id))
      const next = data.items.filter((comment) => !existingIds.has(comment.id))
      return [...prev, ...next]
    })
  }, [data, offset])

  const hasMore = items.length < total

  if (items.length === 0) return null

  return (
    <>
      <CommentaryFeed comments={items} />
      <LoadMoreButton
        onLoadMore={() => setOffset(items.length)}
        hasMore={hasMore}
        isLoading={isFetching}
      />
    </>
  )
}
