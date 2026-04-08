'use client'

import type { inferRouterOutputs } from '@trpc/server'
import { useSearchParams } from 'next/navigation'
import { EmptyState } from '~/components/public/empty-state'
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

  return {
    promptLevel: (['beginner', 'intermediate', 'advanced'] as const).find(
      (tier) => tier === promptLevel,
    ),
    modelTier: (['frontier', 'mid', 'small'] as const).find((tier) => tier === modelTier),
    modelSnapshotId: normalizeModelSnapshotId(modelFilters, modelSnapshotId),
  }
}

export function RankingDetailContent(props: RankingDetailContentProps) {
  const searchParams = useSearchParams()
  const filters = normalizeRankingFilters(
    new URLSearchParams(searchParams.toString()),
    props.modelFilters,
  )
  const hasFilters = !!filters.promptLevel || !!filters.modelTier || !!filters.modelSnapshotId

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

  if (
    hasFilters &&
    !groupQuery.data &&
    !subQuery.data &&
    (groupQuery.isFetching || subQuery.isFetching)
  ) {
    return <p className="text-sm text-muted-foreground">Loading rankings...</p>
  }

  const data =
    props.kind === 'group'
      ? hasFilters
        ? (groupQuery.data ?? props.initialData)
        : props.initialData
      : hasFilters
        ? (subQuery.data ?? props.initialData)
        : props.initialData

  const heading =
    props.kind === 'group'
      ? (data.categoryGroup?.name ?? 'Category')
      : (data.category?.name ?? 'Category')

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
