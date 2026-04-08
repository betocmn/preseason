export const revalidate = 3600 // 1 hour

import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { BenchmarkRankingFilters } from '~/components/public/benchmark-ranking-filters'
import { EmptyState } from '~/components/public/empty-state'
import { RankingIndex } from '~/components/public/ranking-index'
import { RankingTable } from '~/components/public/ranking-table'
import { normalizeModelSnapshotId } from '~/lib/model-filters'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Rankings',
  description: 'Benchmark-grade rankings of tools recommended by LLMs across all categories.',
  openGraph: {
    title: 'Rankings',
    description: 'Benchmark-grade rankings of tools recommended by LLMs across all categories.',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rankings',
    description: 'Benchmark-grade rankings of tools recommended by LLMs across all categories.',
    images: ['/opengraph-image'],
  },
}

type Props = {
  searchParams: Promise<{
    category?: string
    sub?: string
    promptLevel?: string
    modelTier?: string
    modelSnapshotId?: string
  }>
}

export default async function RankingsPage({ searchParams }: Props) {
  const { category: rawCategory, sub, promptLevel, modelTier, modelSnapshotId } = await searchParams
  const category = rawCategory ?? 'devtools'
  const caller = await api()
  const [categoryGroups, modelFiltersData] = await Promise.all([
    caller.category.listGroups(),
    caller.benchmarkRanking.listModelFilters({}),
  ])

  const groups = categoryGroups.map((g) => ({
    slug: g.slug,
    name: g.name,
    subcategories: g.subcategories.map((s) => ({ slug: s.slug, name: s.name })),
  }))
  const modelFilters = modelFiltersData.companies

  const validPromptLevel = (['beginner', 'intermediate', 'advanced'] as const).find(
    (t) => t === promptLevel,
  )
  const validModelTier = (['frontier', 'mid', 'small'] as const).find((t) => t === modelTier)
  const validModelSnapshotId = normalizeModelSnapshotId(modelFilters, modelSnapshotId)
  const showIndex = !category && !sub

  // Fetch data for either index view or selected category/subcategory view
  const indexGroups = showIndex
    ? await Promise.all(
        groups.map(async (group) => {
          const data = await caller.benchmarkRanking.byCategoryGroup({
            groupSlug: group.slug,
            promptLevel: validPromptLevel,
            modelTier: validModelTier,
            modelSnapshotId: validModelSnapshotId,
          })

          return {
            slug: group.slug,
            name: group.name,
            ranking: data.ranking
              ? {
                  items: data.ranking.items,
                  totalEligibleDecisions: data.ranking.totalEligibleDecisions,
                  meetsPublicationThreshold: data.ranking.meetsPublicationThreshold,
                }
              : null,
          }
        }),
      )
    : []

  // When a specific category/subcategory is selected, fetch its ranking server-side
  const isGroup = !!category && !sub
  const selectedRanking = !showIndex
    ? sub
      ? await caller.benchmarkRanking.byCategory({
          categorySlug: sub,
          promptLevel: validPromptLevel,
          modelTier: validModelTier,
          modelSnapshotId: validModelSnapshotId,
        })
      : await caller.benchmarkRanking.byCategoryGroup({
          groupSlug: category,
          promptLevel: validPromptLevel,
          modelTier: validModelTier,
          modelSnapshotId: validModelSnapshotId,
        })
    : null

  const heading = selectedRanking
    ? isGroup
      ? (('categoryGroup' in selectedRanking && selectedRanking.categoryGroup?.name) || 'Category')
      : (('category' in selectedRanking && selectedRanking.category?.name) || 'Category')
    : null

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">Rankings</h1>
        <Link
          href="/methodology"
          className="ml-auto text-sm text-muted-foreground hover:text-foreground"
        >
          Methodology
        </Link>
      </div>

      <Suspense fallback={null}>
        <BenchmarkRankingFilters
          groups={groups}
          modelFilters={modelFilters}
          currentGroup={category}
          currentSub={sub}
          currentPromptLevel={validPromptLevel}
          currentModelTier={validModelTier}
          currentModelSnapshotId={validModelSnapshotId}
        />
      </Suspense>

      <div className="mt-6">
        {showIndex ? (
          <RankingIndex groups={indexGroups} />
        ) : selectedRanking?.ranking && selectedRanking.ranking.items.length > 0 ? (
          <div>
            <h2 className="mb-4 text-lg font-semibold">{heading}</h2>
            <RankingTable
              items={selectedRanking.ranking.items}
              meetsPublicationThreshold={selectedRanking.ranking.meetsPublicationThreshold}
            />
          </div>
        ) : (
          <EmptyState
            title={`No benchmark data for ${heading ?? 'this category'} yet`}
            description="Rankings are computed from published benchmark runs. Check back after runs have completed."
          />
        )}
      </div>
    </div>
  )
}
