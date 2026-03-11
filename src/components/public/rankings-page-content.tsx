'use client'

import { EmptyState } from '~/components/public/empty-state'
import { RankingTable } from '~/components/public/ranking-table'
import { api } from '~/trpc/react'

type RankingsPageContentProps = {
  currentGroup?: string
  currentSub?: string
  promptTier?: 'basic' | 'intermediate' | 'advanced'
  modelTier?: 'frontier' | 'mid' | 'small'
  defaultSubcategorySlug?: string
}

export function RankingsPageContent({
  currentGroup,
  currentSub,
  promptTier,
  modelTier,
  defaultSubcategorySlug,
}: RankingsPageContentProps) {
  // When no filter at all, show the first subcategory's benchmark ranking
  const effectiveSub = currentSub ?? (!currentGroup ? defaultSubcategorySlug : undefined)
  const isGroup = !!currentGroup && !currentSub

  const groupQuery = api.benchmarkRanking.byCategoryGroup.useQuery(
    {
      groupSlug: currentGroup ?? '',
      promptTier,
      modelTier,
    },
    { enabled: isGroup },
  )

  const subQuery = api.benchmarkRanking.byCategory.useQuery(
    {
      categorySlug: effectiveSub ?? '',
      promptTier,
      modelTier,
    },
    { enabled: !!effectiveSub },
  )

  const isLoading = isGroup ? groupQuery.isLoading : subQuery.isLoading

  const ranking = isGroup ? groupQuery.data?.ranking : subQuery.data?.ranking

  const heading = isGroup
    ? (groupQuery.data?.categoryGroup?.name ?? 'Category')
    : (subQuery.data?.category?.name ?? 'Category')

  if (isLoading) return null

  if (!ranking || ranking.items.length === 0) {
    return (
      <EmptyState
        title={`No benchmark data for ${heading} yet`}
        description="Rankings are computed from published benchmark runs. Check back after runs have completed."
      />
    )
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold">{heading}</h2>
      <RankingTable
        items={ranking.items}
        meetsPublicationThreshold={ranking.meetsPublicationThreshold}
      />
    </div>
  )
}
