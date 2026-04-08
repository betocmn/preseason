'use client'

import { useSearchParams } from 'next/navigation'
import { EmptyState } from '~/components/public/empty-state'
import { RankingIndex } from '~/components/public/ranking-index'
import { RankingTable } from '~/components/public/ranking-table'
import { normalizeModelSnapshotId, type ModelFilterCompany } from '~/lib/model-filters'
import { api, type RouterOutputs } from '~/trpc/react'

type RankingIndexGroup = RouterOutputs['benchmarkRanking']['listIndexGroups'][number]

type RankingsPageContentProps = {
  initialGroups: RankingIndexGroup[]
  modelFilters: ModelFilterCompany[]
}

function normalizeRankingFilters(
  searchParams: URLSearchParams,
  modelFilters: ModelFilterCompany[],
) {
  const category = searchParams.get('category') ?? undefined
  const sub = searchParams.get('sub') ?? undefined
  const promptLevel = searchParams.get('promptLevel') ?? undefined
  const modelTier = searchParams.get('modelTier') ?? undefined
  const modelSnapshotId = searchParams.get('modelSnapshotId') ?? undefined
  const safeStr = (value: string | undefined) =>
    value && value.length >= 1 && value.length <= 100 ? value : undefined

  return {
    category: safeStr(category),
    sub: safeStr(sub),
    promptLevel: (['beginner', 'intermediate', 'advanced'] as const).find(
      (tier) => tier === promptLevel,
    ),
    modelTier: (['frontier', 'mid', 'small'] as const).find((tier) => tier === modelTier),
    modelSnapshotId: normalizeModelSnapshotId(modelFilters, modelSnapshotId),
  }
}

export function RankingsPageContent({ initialGroups, modelFilters }: RankingsPageContentProps) {
  const searchParams = useSearchParams()
  const filters = normalizeRankingFilters(
    new URLSearchParams(searchParams.toString()),
    modelFilters,
  )
  const showIndex = !filters.category && !filters.sub
  const hasModelFilters = !!filters.promptLevel || !!filters.modelTier || !!filters.modelSnapshotId
  const isGroup = !!filters.category && !filters.sub

  const indexQuery = api.benchmarkRanking.listIndexGroups.useQuery(
    {
      promptLevel: filters.promptLevel,
      modelTier: filters.modelTier,
      modelSnapshotId: filters.modelSnapshotId,
    },
    { enabled: showIndex && hasModelFilters },
  )

  const groupQuery = api.benchmarkRanking.byCategoryGroup.useQuery(
    {
      groupSlug: filters.category ?? '',
      promptLevel: filters.promptLevel,
      modelTier: filters.modelTier,
      modelSnapshotId: filters.modelSnapshotId,
    },
    { enabled: !showIndex && isGroup },
  )

  const subQuery = api.benchmarkRanking.byCategory.useQuery(
    {
      categorySlug: filters.sub ?? '',
      promptLevel: filters.promptLevel,
      modelTier: filters.modelTier,
      modelSnapshotId: filters.modelSnapshotId,
    },
    { enabled: !showIndex && !!filters.sub },
  )

  if (
    (showIndex && hasModelFilters && !indexQuery.data && indexQuery.isFetching) ||
    (!showIndex &&
      !groupQuery.data &&
      !subQuery.data &&
      (groupQuery.isFetching || subQuery.isFetching))
  ) {
    return <p className="text-sm text-muted-foreground">Loading rankings...</p>
  }

  if (showIndex) {
    const groups = hasModelFilters ? (indexQuery.data ?? initialGroups) : initialGroups
    return <RankingIndex groups={groups} />
  }

  const selected = isGroup ? groupQuery.data : subQuery.data
  const heading = isGroup
    ? (selected?.categoryGroup?.name ?? 'Category')
    : (selected?.category?.name ?? 'Category')

  if (!selected?.ranking || selected.ranking.items.length === 0) {
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
        items={selected.ranking.items}
        meetsPublicationThreshold={selected.ranking.meetsPublicationThreshold}
      />
    </div>
  )
}
