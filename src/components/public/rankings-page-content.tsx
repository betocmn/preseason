'use client'

import { EmptyState } from '~/components/public/empty-state'
import { RankingTable } from '~/components/public/ranking-table'
import { api } from '~/trpc/react'

type RankingsPageContentProps = {
  currentGroup?: string
  currentSub?: string
  promptLevel?: 'beginner' | 'intermediate' | 'advanced'
  modelTier?: 'frontier' | 'mid' | 'small'
  modelSnapshotId?: string
}

export function RankingsPageContent({
  currentGroup,
  currentSub,
  promptLevel,
  modelTier,
  modelSnapshotId,
}: RankingsPageContentProps) {
  const effectiveSub = currentSub
  const isGroup = !!currentGroup && !currentSub

  const groupQuery = api.benchmarkRanking.byCategoryGroup.useQuery(
    {
      groupSlug: currentGroup ?? '',
      promptLevel,
      modelTier,
      modelSnapshotId,
    },
    { enabled: isGroup },
  )

  const subQuery = api.benchmarkRanking.byCategory.useQuery(
    {
      categorySlug: effectiveSub ?? '',
      promptLevel,
      modelTier,
      modelSnapshotId,
    },
    { enabled: !!effectiveSub },
  )

  const isLoading = isGroup ? groupQuery.isLoading : subQuery.isLoading

  const ranking = isGroup ? groupQuery.data?.ranking : subQuery.data?.ranking

  const heading = isGroup
    ? (groupQuery.data?.categoryGroup?.name ?? 'Category')
    : (subQuery.data?.category?.name ?? 'Category')

  if (!currentGroup && !currentSub) {
    return null
  }
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
