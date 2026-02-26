'use client'

import { Wine } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function SearchEmptyState() {
  const t = useTranslations('search')
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Wine className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-lg font-semibold">{t('noResults')}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{t('noResultsHint')}</p>
    </div>
  )
}
