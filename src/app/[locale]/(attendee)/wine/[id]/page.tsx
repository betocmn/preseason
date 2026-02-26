import { ArrowLeft, Wine } from 'lucide-react'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { FavoriteButton } from '~/components/attendee/favorite-button'
import { WineReviewsSection } from '~/components/attendee/wine-reviews-section'
import { Badge } from '~/components/ui/badge'
import { Separator } from '~/components/ui/separator'
import { StarRating } from '~/components/ui/star-rating'
import { Link } from '~/i18n/navigation'
import { cn } from '~/lib/utils'
import { wineTypeBadgeStyles } from '~/lib/wine-type-styles'
import type { RouterOutputs } from '~/trpc/react'
import { api } from '~/trpc/server'

type WineDetail = RouterOutputs['wine']['getById']

async function getWine(id: string): Promise<WineDetail | null> {
  const caller = await api()
  try {
    return await caller.wine.getById({ id })
  } catch {
    return null
  }
}

export default async function WineDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { id } = await params
  const t = await getTranslations('wineDetail')

  const wine = await getWine(id)
  if (!wine) {
    notFound()
  }

  const caller = await api()
  const stats = await caller.review.getStats({ wineId: id })

  const grapeNames = wine.wineGrapeVarieties?.map((wgv) => wgv.grapeVariety?.name).filter(Boolean)

  return (
    <div className="mx-auto max-w-lg p-4 lg:max-w-2xl">
      {/* Back link */}
      <Link
        href="/search"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('back')}
      </Link>

      {/* Wine image */}
      <div className="mb-4 flex h-64 w-full items-center justify-center rounded-xl bg-muted">
        {wine.imageUrl ? (
          <Image
            src={wine.imageUrl}
            alt={wine.name}
            width={400}
            height={256}
            className="h-64 w-full rounded-xl object-cover"
          />
        ) : (
          <Wine className="h-16 w-16 text-muted-foreground" />
        )}
      </div>

      {/* Name, type badge, favorite */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight">
            {wine.name}
            {wine.vintage ? ` ${wine.vintage}` : ''}
          </h1>
          {wine.oneLiner && <p className="mt-1 text-sm text-muted-foreground">{wine.oneLiner}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className={cn('text-xs', wineTypeBadgeStyles[wine.type])}>
            {t(`wineTypes.${wine.type}`)}
          </Badge>
          <FavoriteButton wineId={wine.id} />
        </div>
      </div>

      {/* Rating summary */}
      {stats.reviewCount > 0 && (
        <div className="mb-4 flex items-center gap-2">
          <StarRating value={stats.averageRating} readOnly size="md" />
          <span className="text-sm font-medium">
            {t('averageRating', { rating: stats.averageRating.toFixed(1) })}
          </span>
          <span className="text-sm text-muted-foreground">
            ({t('reviewCount', { count: stats.reviewCount })})
          </span>
        </div>
      )}

      <Separator className="my-4" />

      {/* Wine details */}
      <div className="space-y-3">
        {wine.producer && (
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-muted-foreground">{t('producer')}</span>
            <span className="text-sm">{wine.producer.name}</span>
          </div>
        )}
        {wine.region && (
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-muted-foreground">{t('region')}</span>
            <span className="text-sm">
              {wine.region.name}
              {wine.region.country ? `, ${wine.region.country}` : ''}
            </span>
          </div>
        )}
        {grapeNames && grapeNames.length > 0 && (
          <div>
            <span className="text-sm font-medium text-muted-foreground">{t('grapes')}</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {grapeNames.map((name) => (
                <Badge key={name} variant="secondary" className="text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-4 text-sm">
          {wine.price != null && (
            <span className="font-medium">{t('price', { price: wine.price })}</span>
          )}
          {wine.alcoholPercent != null && (
            <span className="text-muted-foreground">
              {t('abv', { percent: wine.alcoholPercent })}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      {wine.description && (
        <>
          <Separator className="my-4" />
          <div>
            <h2 className="mb-2 text-sm font-semibold">{t('description')}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{wine.description}</p>
          </div>
        </>
      )}

      {/* Technical details */}
      {(wine.fermentationContainer ||
        wine.oakAging ||
        wine.leesContact ||
        wine.sedimentContact) && (
        <>
          <Separator className="my-4" />
          <div>
            <h2 className="mb-2 text-sm font-semibold">{t('technicalDetails')}</h2>
            <div className="space-y-2">
              {wine.fermentationContainer && (
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t('fermentationContainer')}
                  </span>
                  <span className="text-sm">{wine.fermentationContainer}</span>
                </div>
              )}
              {wine.oakAging && (
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">{t('oakAging')}</span>
                  <span className="text-sm">{wine.oakAging}</span>
                </div>
              )}
              {wine.leesContact && (
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">{t('leesContact')}</span>
                  <span className="text-sm">{wine.leesContact}</span>
                </div>
              )}
              {wine.sedimentContact && (
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">{t('sedimentContact')}</span>
                  <span className="text-sm">{wine.sedimentContact}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <Separator className="my-4" />

      {/* Reviews section */}
      <WineReviewsSection wineId={wine.id} initialReviewCount={stats.reviewCount} />
    </div>
  )
}
