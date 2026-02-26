'use client'

import { useLocale, useTranslations } from 'next-intl'
import { StarRating } from '~/components/ui/star-rating'
import type { RouterOutputs } from '~/trpc/react'

type ReviewCardProps = {
  item: RouterOutputs['review']['getByWine']['items'][number]
}

export function ReviewCard({ item }: ReviewCardProps) {
  const t = useTranslations('wineDetail')
  const locale = useLocale()
  const { review, reviewerFirstName, reviewerLastName } = item

  const displayName = reviewerFirstName
    ? `${reviewerFirstName} ${reviewerLastName ? `${reviewerLastName.charAt(0)}.` : ''}`
    : t('reviewBy', { name: '?' })

  const formattedDate = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(review.createdAt))

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{displayName}</span>
          <StarRating value={review.rating} readOnly size="sm" />
        </div>
        <span className="text-xs text-muted-foreground">{formattedDate}</span>
      </div>
      {review.notes && <p className="text-sm text-muted-foreground">{review.notes}</p>}
    </div>
  )
}
