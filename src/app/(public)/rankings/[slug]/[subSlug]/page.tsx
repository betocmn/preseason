import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { BenchmarkRankingFilters } from '~/components/public/benchmark-ranking-filters'
import { EmptyState } from '~/components/public/empty-state'
import { RankingTable } from '~/components/public/ranking-table'
import { SidebarLayout } from '~/components/public/sidebar-layout'
import { normalizeModelSelection } from '~/lib/model-filters'
import { api } from '~/trpc/server'

type Props = {
  params: Promise<{ slug: string; subSlug: string }>
  searchParams: Promise<{
    promptLevel?: string
    modelTier?: string
    modelCompany?: string
    modelFamily?: string
    modelSnapshotId?: string
  }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subSlug } = await params
  const caller = await api()
  const data = await caller.benchmarkRanking.byCategory({ categorySlug: subSlug })

  if (!data.category) {
    return { title: 'Category Not Found' }
  }

  const title = `${data.category.name} Rankings`
  const description = `Benchmark rankings for tools in the ${data.category.name} subcategory.`
  return {
    title,
    description,
    openGraph: { title, description, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function SubcategoryRankingPage({ params, searchParams }: Props) {
  const { slug, subSlug } = await params
  const { promptLevel, modelTier, modelCompany, modelFamily, modelSnapshotId } = await searchParams
  const caller = await api()
  const validPromptLevel = (['beginner', 'intermediate', 'advanced'] as const).find(
    (tier) => tier === promptLevel,
  )
  const validModelTier = (['frontier', 'mid', 'small'] as const).find((tier) => tier === modelTier)
  const [groups, modelFiltersData] = await Promise.all([
    caller.category.listGroups(),
    caller.benchmarkRanking.listModelFilters({}),
  ])
  const modelFilters = modelFiltersData.companies
  const validModelSelection = normalizeModelSelection(modelFilters, {
    modelCompany,
    modelFamily,
    modelSnapshotId,
  })
  const data = await caller.benchmarkRanking.byCategory({
    categorySlug: subSlug,
    promptLevel: validPromptLevel,
    modelTier: validModelTier,
    modelCompany: validModelSelection.modelCompany,
    modelFamily: validModelSelection.modelFamily,
    modelSnapshotId: validModelSelection.modelSnapshotId,
  })

  if (!data.category) {
    notFound()
  }
  if (data.category.categoryGroup.slug !== slug) {
    notFound()
  }

  return (
    <SidebarLayout groups={groups} section="rankings">
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
          currentGroup={slug}
          currentSub={subSlug}
          currentPromptLevel={validPromptLevel}
          currentModelTier={validModelTier}
          currentModelCompany={validModelSelection.modelCompany}
          currentModelFamily={validModelSelection.modelFamily}
          currentModelSnapshotId={validModelSelection.modelSnapshotId}
          basePath={`/rankings/${slug}/${subSlug}`}
          showCategorySelect={false}
        />
      </Suspense>
      <h2 className="mb-4 mt-6 text-lg font-semibold">{data.category.name}</h2>
      {data.ranking && data.ranking.items.length > 0 ? (
        <RankingTable
          items={data.ranking.items}
          meetsPublicationThreshold={data.ranking.meetsPublicationThreshold}
        />
      ) : (
        <EmptyState
          title={`No benchmark data for ${data.category.name} yet`}
          description="Rankings are computed from published benchmark runs. Check back after runs have completed."
        />
      )}
    </SidebarLayout>
  )
}
