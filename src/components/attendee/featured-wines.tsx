'use client'

import { useTranslations } from 'next-intl'
import { WineCard } from '~/components/attendee/wine-card'
import { WineCardSkeleton } from '~/components/attendee/wine-card-skeleton'
import { api } from '~/trpc/react'

export function FeaturedWines() {
  const t = useTranslations('home')
  const { data, isLoading } = api.wine.listRecent.useQuery({ limit: 6 })

  if (isLoading) {
    return (
      <section>
        <h2 className="mb-3 text-lg font-semibold">{t('recentlyAdded')}</h2>
        <WineCardSkeleton />
      </section>
    )
  }

  if (!data || data.length === 0) {
    return null
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{t('recentlyAdded')}</h2>
      <div className="flex flex-col gap-3">
        {data.map((item) => (
          <WineCard
            key={item.wine.id}
            wine={item.wine}
            producerName={item.producerName}
            regionName={item.regionName}
          />
        ))}
      </div>
    </section>
  )
}
