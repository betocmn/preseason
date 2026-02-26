'use client'

import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { SearchEmptyState } from '~/components/attendee/search-empty-state'
import { WineCard } from '~/components/attendee/wine-card'
import { WineCardSkeleton } from '~/components/attendee/wine-card-skeleton'
import { Button } from '~/components/ui/button'
import type { RouterOutputs } from '~/trpc/react'

export type WineItem = RouterOutputs['wine']['list']['items'][number]

type WineCardListProps = {
  items: WineItem[]
  total: number
  isLoading: boolean
  isFetchingMore: boolean
  hasMore: boolean
  onLoadMore: () => void
}

export function WineCardList({
  items,
  total,
  isLoading,
  isFetchingMore,
  hasMore,
  onLoadMore,
}: WineCardListProps) {
  const t = useTranslations('search')
  if (isLoading) {
    return <WineCardSkeleton />
  }

  if (items.length === 0) {
    return <SearchEmptyState />
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('winesFound', { count: total })}</p>
      {items.map((item) => (
        <WineCard
          key={item.wine.id}
          wine={item.wine}
          producerName={item.producerName}
          regionName={item.regionName}
        />
      ))}
      {hasMore && (
        <Button
          variant="outline"
          onClick={onLoadMore}
          disabled={isFetchingMore}
          className="mx-auto mt-2"
        >
          {isFetchingMore ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t('loading')}
            </>
          ) : (
            t('loadMore')
          )}
        </Button>
      )}
    </div>
  )
}
