export const dynamic = 'force-static'
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
  params: Promise<{ slug: string; subSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!hasBuildDatabaseAccess()) {
    return {
      title: 'Rankings',
      description: 'Benchmark rankings for tools by category.',
    }
  }

  const { slug, subSlug } = await params
  const caller = await publicApi()
  const data = await caller.benchmarkRanking.byCategory({ categorySlug: subSlug })

  if (!data.category) {
    return { title: 'Category Not Found' }
  }

  const title = `${data.category.name} Rankings`
  const description = `Benchmark rankings for tools in the ${data.category.name} subcategory.`
  const imagePath = `/rankings/${encodeURIComponent(slug)}/${encodeURIComponent(subSlug)}/opengraph-image`
  return {
    title,
    description,
    openGraph: { title, description, type: 'article', images: [imagePath] },
    twitter: { card: 'summary_large_image', title, description, images: [imagePath] },
  }
}

export default async function SubcategoryRankingPage({ params }: Props) {
  await deferToRequestWhenDatabaseUnavailable()
  const { slug, subSlug } = await params
  const caller = await publicApi()
  const [groups, modelFiltersData] = await Promise.all([
    caller.category.listGroups(),
    caller.benchmarkRanking.listModelFilters({}),
  ])
  const modelFilters = modelFiltersData.companies
  const data = await caller.benchmarkRanking.byCategory({
    categorySlug: subSlug,
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
          basePath={`/rankings/${slug}/${subSlug}`}
          showCategorySelect={false}
        />
      </Suspense>
      <Suspense
        fallback={<p className="mt-6 text-sm text-muted-foreground">Loading rankings...</p>}
      >
        <RankingDetailContent
          initialData={data}
          kind="subcategory"
          modelFilters={modelFilters}
          slug={subSlug}
        />
      </Suspense>
    </SidebarLayout>
  )
}
