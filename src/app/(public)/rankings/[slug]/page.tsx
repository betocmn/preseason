export const revalidate = 3600 // 1 hour

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { BenchmarkRankingFilters } from '~/components/public/benchmark-ranking-filters'
import { RankingDetailContent } from '~/components/public/ranking-detail-content'
import { SidebarLayout } from '~/components/public/sidebar-layout'
import { deferToRequestWhenDatabaseUnavailable, hasBuildDatabaseAccess } from '~/server/prerender'
import { publicApi } from '~/trpc/server'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!hasBuildDatabaseAccess()) {
    return {
      title: 'Rankings',
      description: 'Benchmark rankings for tools by category.',
    }
  }

  const { slug } = await params
  const caller = await publicApi()
  const data = await caller.benchmarkRanking.byCategoryGroup({ groupSlug: slug })

  if (!data.categoryGroup) {
    return { title: 'Category Not Found' }
  }

  const title = `${data.categoryGroup.name} Rankings`
  const description = `Benchmark rankings for tools in the ${data.categoryGroup.name} category.`
  const imagePath = `/rankings/${encodeURIComponent(slug)}/opengraph-image`
  return {
    title,
    description,
    openGraph: { title, description, type: 'article', images: [imagePath] },
    twitter: { card: 'summary_large_image', title, description, images: [imagePath] },
  }
}

export async function generateStaticParams() {
  if (!hasBuildDatabaseAccess()) {
    return []
  }

  const caller = await publicApi()
  const groups = await caller.category.listGroups()
  return groups.map((group) => ({ slug: group.slug }))
}

export default async function CategoryGroupRankingPage({ params }: Props) {
  await deferToRequestWhenDatabaseUnavailable()
  const { slug } = await params
  const caller = await publicApi()
  const [groups, modelFiltersData] = await Promise.all([
    caller.category.listGroups(),
    caller.benchmarkRanking.listModelFilters({}),
  ])
  const modelFilters = modelFiltersData.companies

  const data = await caller.benchmarkRanking.byCategoryGroup({
    groupSlug: slug,
  })

  if (!data.categoryGroup) {
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
          basePath={`/rankings/${slug}`}
          showCategorySelect={false}
        />
      </Suspense>
      <Suspense
        fallback={<p className="mt-6 text-sm text-muted-foreground">Loading rankings...</p>}
      >
        <RankingDetailContent
          initialData={data}
          kind="group"
          modelFilters={modelFilters}
          slug={slug}
        />
      </Suspense>
    </SidebarLayout>
  )
}
