import type { Metadata } from 'next'
import { Suspense } from 'react'
import { RankingFilters } from '~/components/public/ranking-filters'
import { RankingsPageContent } from '~/components/public/rankings-page-content'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Rankings | Preseason',
  description: 'See which tools LLMs recommend most across all categories.',
}

type Props = {
  searchParams: Promise<{ category?: string; sub?: string }>
}

export default async function RankingsPage({ searchParams }: Props) {
  const { category, sub } = await searchParams
  const effectiveCategory = category ?? 'devtools'
  const caller = await api()
  const categoryGroups = await caller.category.listGroups()

  const groups = categoryGroups.map((g) => ({
    slug: g.slug,
    name: g.name,
    subcategories: g.subcategories.map((s) => ({ slug: s.slug, name: s.name })),
  }))

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-xl font-bold tracking-tight">Rankings</h1>

      <Suspense fallback={null}>
        <RankingFilters groups={groups} currentGroup={effectiveCategory} currentSub={sub} />
      </Suspense>

      <div className="mt-6">
        <RankingsPageContent currentGroup={effectiveCategory} currentSub={sub} />
      </div>
    </div>
  )
}
