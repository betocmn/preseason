'use client'

import { useEffect, useState } from 'react'
import { CommentaryFeed } from '~/components/public/commentary-feed'
import { LoadMoreButton } from '~/components/public/load-more-button'
import { api, type RouterOutputs } from '~/trpc/react'

const PAGE_SIZE = 10

type RecentCommentaryItem = RouterOutputs['comment']['listRecent']['items'][number]

export function RecentCommentaryList() {
  const [offset, setOffset] = useState(0)
  const [items, setItems] = useState<RecentCommentaryItem[]>([])
  const [total, setTotal] = useState(0)

  const { data, isLoading, isFetching } = api.comment.listRecent.useQuery({
    limit: PAGE_SIZE,
    offset,
  })

  useEffect(() => {
    if (!data) return

    setTotal(data.total)
    setItems((prev) => {
      if (offset === 0) return data.items
      const existingIds = new Set(prev.map((comment) => comment.id))
      const next = data.items.filter((comment) => !existingIds.has(comment.id))
      return [...prev, ...next]
    })
  }, [data, offset])

  const hasMore = items.length < total

  if (!isLoading && items.length === 0) return null

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
