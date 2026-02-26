'use client'

import { Wine } from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { Badge } from '~/components/ui/badge'
import { Link } from '~/i18n/navigation'
import { cn } from '~/lib/utils'
import { wineTypeBadgeStyles } from '~/lib/wine-type-styles'
import type { RouterOutputs } from '~/trpc/react'

type WineCardProps = RouterOutputs['wine']['list']['items'][number]

export function WineCard({ wine, producerName, regionName }: WineCardProps) {
  const t = useTranslations('search')
  return (
    <Link
      href={`/wine/${wine.id}`}
      className="flex gap-3 rounded-lg border bg-card p-3 transition-shadow hover:shadow-md"
    >
      <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-muted">
        {wine.imageUrl ? (
          <Image
            src={wine.imageUrl}
            alt={wine.name}
            width={80}
            height={80}
            className="h-20 w-20 rounded-md object-cover"
          />
        ) : (
          <Wine className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold leading-tight">
            {wine.name}
            {wine.vintage ? ` ${wine.vintage}` : ''}
          </h3>
          <Badge
            variant="outline"
            className={cn('shrink-0 text-[10px]', wineTypeBadgeStyles[wine.type])}
          >
            {t(`wineTypes.${wine.type}`)}
          </Badge>
        </div>
        {wine.oneLiner && <p className="truncate text-xs text-muted-foreground">{wine.oneLiner}</p>}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {producerName && <span>{producerName}</span>}
          {producerName && regionName && <span>·</span>}
          {regionName && <span>{regionName}</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {wine.price && (
            <span className="font-medium text-foreground">
              {t('wineCard.price', { price: wine.price })}
            </span>
          )}
          {wine.alcoholPercent != null && (
            <span>{t('wineCard.abv', { percent: wine.alcoholPercent })}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
