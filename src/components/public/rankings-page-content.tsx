'use client'

import { useSearchParams } from 'next/navigation'
import { EmptyState } from '~/components/public/empty-state'
import { RankingIndex } from '~/components/public/ranking-index'
import { resolveFilteredQuery } from '~/components/public/ranking-query-state'
import { RankingTable } from '~/components/public/ranking-table'
import { rankingFiltersFromSearchParams } from '~/lib/model-filters'
import { api, type RouterOutputs } from '~/trpc/react'

type RankingIndexGroup = RouterOutputs['benchmarkRanking']['listIndexGroups'][number]

type RankingsPageContentProps = {
  initialGroups: RankingIndexGroup[]
}

export function RankingsPageContent({ initialGroups }: RankingsPageContentProps) {
  const searchParams = useSearchParams()
  const filters = {
    ...rankingFiltersFromSearchParams(new URLSearchParams(searchParams.toString())),
    category: searchParams.get('category') ?? undefined,
    sub: searchParams.get('sub') ?? undefined,
  }
  const showIndex = !filters.category && !filters.sub
  const hasModelFilters =
    !!filters.promptLevel ||
    !!filters.modelTier ||
    filters.modelRangeId !== undefined ||
    filters.modelSnapshotId !== undefined ||
    !!filters.dateRange
  const isGroup = !!filters.category && !filters.sub

  const indexQuery = api.benchmarkRanking.listIndexGroups.useQuery(
    {
      promptLevel: filters.promptLevel,
      modelTier: filters.modelTier,
      modelSnapshotId: filters.modelSnapshotId,
      modelRangeId: filters.modelRangeId,
      dateRange: filters.dateRange,
    },
    { enabled: showIndex && hasModelFilters },
  )

  const groupQuery = api.benchmarkRanking.byCategoryGroup.useQuery(
    {
      groupSlug: filters.category ?? '',
      promptLevel: filters.promptLevel,
      modelTier: filters.modelTier,
      modelSnapshotId: filters.modelSnapshotId,
      modelRangeId: filters.modelRangeId,
      dateRange: filters.dateRange,
    },
    { enabled: !showIndex && isGroup },
  )

  const subQuery = api.benchmarkRanking.byCategory.useQuery(
    {
      categorySlug: filters.sub ?? '',
      promptLevel: filters.promptLevel,
      modelTier: filters.modelTier,
      modelSnapshotId: filters.modelSnapshotId,
      modelRangeId: filters.modelRangeId,
      dateRange: filters.dateRange,
    },
    { enabled: !showIndex && !!filters.sub },
  )

  if (showIndex) {
    const resolvedIndex = resolveFilteredQuery({
      enabled: hasModelFilters,
      initialData: initialGroups,
      query: {
        data: indexQuery.data,
        status: indexQuery.status,
      },
    })

    if (resolvedIndex.state === 'loading') {
      return <p className="text-sm text-muted-foreground">Loading rankings...</p>
    }

    if (resolvedIndex.state === 'error') {
      return (
        <EmptyState
          title="Could not load filtered rankings"
          description="There was a problem applying the selected filters. Please try again."
        />
      )
    }

    return <RankingIndex groups={resolvedIndex.data} />
  }

  const activeQuery = isGroup ? groupQuery : subQuery
  const resolvedRanking = resolveFilteredQuery({
    enabled: true,
    query: {
      data: activeQuery.data,
      status: activeQuery.status,
    },
  })

  if (resolvedRanking.state === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading rankings...</p>
  }

  if (resolvedRanking.state === 'error') {
    return (
      <EmptyState
        title="Could not load filtered rankings"
        description="There was a problem applying the selected filters. Please try again."
      />
    )
  }

  const selected = resolvedRanking.data
  const heading = isGroup
    ? ((selected && 'categoryGroup' in selected ? selected.categoryGroup?.name : null) ??
      'Category')
    : ((selected && 'category' in selected ? selected.category?.name : null) ?? 'Category')

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
