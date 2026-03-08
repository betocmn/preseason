'use client'

import { EmptyState } from '~/components/public/empty-state'
import { RankingTable } from '~/components/public/ranking-table'
import { api } from '~/trpc/react'

type RankingsPageContentProps = {
  currentGroup?: string
  currentSub?: string
}

export function RankingsPageContent({ currentGroup, currentSub }: RankingsPageContentProps) {
  const overallQuery = api.ranking.overall.useQuery(
    { days: 30, limit: 50 },
    { enabled: !currentGroup && !currentSub },
  )

  const groupQuery = api.ranking.byCategorySlug.useQuery(
    { categorySlug: currentGroup ?? '', days: 30 },
    { enabled: !!currentGroup && !currentSub },
  )

  const subQuery = api.ranking.bySubcategorySlug.useQuery(
    { subcategorySlug: currentSub ?? '', days: 30 },
    { enabled: !!currentSub },
  )

  const isOverall = !currentGroup && !currentSub
  const isGroup = !!currentGroup && !currentSub

  const isLoading = isOverall
    ? overallQuery.isLoading
    : isGroup
      ? groupQuery.isLoading
      : subQuery.isLoading

  const items = isOverall
    ? (overallQuery.data?.items ?? [])
    : isGroup
      ? (groupQuery.data?.items ?? [])
      : (subQuery.data?.items ?? [])

  const heading = isOverall
    ? 'Overall Rankings (30 days)'
    : isGroup
      ? `${groupQuery.data?.categoryGroup?.name ?? 'Category'} (30 days)`
      : `${subQuery.data?.category?.name ?? 'Subcategory'} (30 days)`

  const emptyTitle = isOverall
    ? 'No ranking data yet'
    : isGroup
      ? `No tools ranked in ${groupQuery.data?.categoryGroup?.name ?? 'this category'} yet`
      : `No tools ranked in ${subQuery.data?.category?.name ?? 'this subcategory'} yet`

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">{heading}</h2>
      {items.length > 0 ? (
        <RankingTable items={items} showCategoryCoverage={isOverall} />
      ) : isLoading ? null : (
        <EmptyState
          title={emptyTitle}
          description="Rankings are computed from recommendation runs. Check back after runs have completed."
        />
      )}
    </div>
  )
}
