'use client'

import { Loader2 } from 'lucide-react'
import { Button } from '~/components/ui/button'

type LoadMoreButtonProps = {
  onLoadMore: () => void
  hasMore: boolean
  isLoading: boolean
}

export function LoadMoreButton({ onLoadMore, hasMore, isLoading }: LoadMoreButtonProps) {
  if (!hasMore) return null

  return (
    <div className="flex justify-center pt-4">
      <Button variant="outline" onClick={onLoadMore} disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading...
          </>
        ) : (
          'Load more'
        )}
      </Button>
    </div>
  )
}
