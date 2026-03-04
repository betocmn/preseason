'use client'

import { useState } from 'react'
import { CommentaryFeed } from '~/components/public/commentary-feed'
import { LoadMoreButton } from '~/components/public/load-more-button'
import { api } from '~/trpc/react'

const PAGE_SIZE = 10

export function RecentCommentaryList() {
  const [limit, setLimit] = useState(PAGE_SIZE)

  const { data, isLoading } = api.comment.listRecent.useQuery({
    limit,
    offset: 0,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const hasMore = items.length < total

  if (!isLoading && items.length === 0) return null

  return (
    <>
      <CommentaryFeed comments={items} />
      <LoadMoreButton
        onLoadMore={() => setLimit((prev) => prev + PAGE_SIZE)}
        hasMore={hasMore}
        isLoading={isLoading}
      />
    </>
  )
}
