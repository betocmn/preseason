'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { ReviewCard } from '~/components/attendee/review-card'
import { Button } from '~/components/ui/button'
import { Skeleton } from '~/components/ui/skeleton'
import { api } from '~/trpc/react'

const PAGE_SIZE = 10

type WineReviewsSectionProps = {
  wineId: string
  initialReviewCount: number
}

export function WineReviewsSection({ wineId, initialReviewCount }: WineReviewsSectionProps) {
  const t = useTranslations('wineDetail')
  const [limit, setLimit] = useState(PAGE_SIZE)

  const { data, isLoading } = api.review.getByWine.useQuery({
    wineId,
    limit,
    offset: 0,
  })

  const items = data?.items ?? []
  const total = data?.total ?? initialReviewCount
  const hasMore = items.length < total

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">
        {t('reviews')} ({total})
      </h2>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm font-medium text-muted-foreground">{t('noReviews')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('noReviewsHint')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <ReviewCard key={item.review.id} item={item} />
          ))}
          {hasMore && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLimit((prev) => prev + PAGE_SIZE)}
            >
              {t('loadMoreReviews')}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
