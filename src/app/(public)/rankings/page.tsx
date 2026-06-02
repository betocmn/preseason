export const revalidate = 3600 // 1 hour

import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { BenchmarkRankingFilters } from '~/components/public/benchmark-ranking-filters'
import { RankingsPageContent } from '~/components/public/rankings-page-content'
import { deferToRequestWhenDatabaseUnavailable } from '~/server/prerender'
import { publicApi } from '~/trpc/server'

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

export default async function RankingsPage() {
  await deferToRequestWhenDatabaseUnavailable()
  const caller = await publicApi()
  const [categoryGroups, modelFiltersData, indexGroups] = await Promise.all([
    caller.category.listGroups(),
    caller.benchmarkRanking.listModelFilters({}),
    caller.benchmarkRanking.listIndexGroups({}),
  ])

  const groups = categoryGroups.map((g) => ({
    slug: g.slug,
    name: g.name,
    subcategories: g.subcategories.map((s) => ({ slug: s.slug, name: s.name })),
  }))
  const modelFilters = modelFiltersData.companies

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
        <BenchmarkRankingFilters groups={groups} modelFilters={modelFilters} />
      </Suspense>

      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading rankings...</p>}>
          <RankingsPageContent initialGroups={indexGroups} modelFilters={modelFilters} />
        </Suspense>
      </div>
    </div>
  )
}
