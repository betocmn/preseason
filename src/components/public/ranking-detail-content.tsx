'use client'

import type { inferRouterOutputs } from '@trpc/server'
import { useSearchParams } from 'next/navigation'
import { EmptyState } from '~/components/public/empty-state'
import { resolveFilteredQuery } from '~/components/public/ranking-query-state'
import { RankingTable } from '~/components/public/ranking-table'
import { type ModelFilterCompany, normalizeModelSnapshotId } from '~/lib/model-filters'
import type { AppRouter } from '~/server/api/root'
import { api } from '~/trpc/react'

type GroupRankingResult = inferRouterOutputs<AppRouter>['benchmarkRanking']['byCategoryGroup']
type CategoryRankingResult = inferRouterOutputs<AppRouter>['benchmarkRanking']['byCategory']

type RankingDetailContentProps =
  | {
      initialData: GroupRankingResult
      kind: 'group'
      modelFilters: ModelFilterCompany[]
      slug: string
    }
  | {
      initialData: CategoryRankingResult
      kind: 'subcategory'
      modelFilters: ModelFilterCompany[]
      slug: string
    }

function normalizeRankingFilters(
  searchParams: URLSearchParams,
  modelFilters: ModelFilterCompany[],
) {
  const promptLevel = searchParams.get('promptLevel') ?? undefined
  const modelTier = searchParams.get('modelTier') ?? undefined
  const modelSnapshotId = searchParams.get('modelSnapshotId') ?? undefined
  const dateRange = searchParams.get('dateRange') ?? undefined

  return {
    promptLevel: (['beginner', 'intermediate', 'advanced'] as const).find(
      (tier) => tier === promptLevel,
    ),
    modelTier: (['frontier', 'mid', 'small'] as const).find((tier) => tier === modelTier),
    modelSnapshotId: normalizeModelSnapshotId(modelFilters, modelSnapshotId),
    dateRange: (['1m', '3m', '6m'] as const).find((range) => range === dateRange),
  }
}

export function RankingDetailContent(props: RankingDetailContentProps) {
  const searchParams = useSearchParams()
  const filters = normalizeRankingFilters(
    new URLSearchParams(searchParams.toString()),
    props.modelFilters,
  )
  const hasFilters =
    !!filters.promptLevel || !!filters.modelTier || !!filters.modelSnapshotId || !!filters.dateRange

  const groupQuery = api.benchmarkRanking.byCategoryGroup.useQuery(
    {
      groupSlug: props.slug,
      ...filters,
    },
    { enabled: props.kind === 'group' && hasFilters },
  )

  const subQuery = api.benchmarkRanking.byCategory.useQuery(
    {
      categorySlug: props.slug,
      ...filters,
    },
    { enabled: props.kind === 'subcategory' && hasFilters },
  )

  const initialHeading =
    props.kind === 'group'
      ? (props.initialData.categoryGroup?.name ?? 'Category')
      : (props.initialData.category?.name ?? 'Category')

  const activeQuery = props.kind === 'group' ? groupQuery : subQuery
  const resolved = resolveFilteredQuery({
    enabled: hasFilters,
    initialData: props.initialData,
    query: {
      data: activeQuery.data,
      status: activeQuery.status,
    },
  })

  if (resolved.state === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading rankings...</p>
  }

  if (resolved.state === 'error') {
    return (
      <EmptyState
        title={`Could not load filtered rankings for ${initialHeading}`}
        description="There was a problem applying the selected filters. Please try again."
      />
    )
  }

  const data = resolved.data

  const heading =
    props.kind === 'group'
      ? ((data && 'categoryGroup' in data ? data.categoryGroup?.name : null) ?? 'Category')
      : ((data && 'category' in data ? data.category?.name : null) ?? 'Category')

  return data.ranking && data.ranking.items.length > 0 ? (
    <div>
      <h2 className="mb-4 mt-6 text-lg font-semibold">{heading}</h2>
      <RankingTable
        items={data.ranking.items}
        meetsPublicationThreshold={data.ranking.meetsPublicationThreshold}
      />
    </div>
  ) : (
    <EmptyState
      title={`No benchmark data for ${heading} yet`}
      description="Rankings are computed from published benchmark runs. Check back after runs have completed."
    />
  )
}
