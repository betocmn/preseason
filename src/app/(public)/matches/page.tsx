import type { Metadata } from 'next'
import { Suspense } from 'react'
import { MatchFilters } from '~/components/public/match-filters'
import { MatchesPageContent } from '~/components/public/matches-page-content'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Live Matches',
  description: 'Head-to-head tool battles based on LLM recommendations.',
  openGraph: { title: 'Live Matches', description: 'Head-to-head tool battles based on LLM recommendations.' },
  twitter: { card: 'summary_large_image', title: 'Live Matches', description: 'Head-to-head tool battles based on LLM recommendations.' },
}

type Props = {
  searchParams: Promise<{ category?: string; sub?: string; tool?: string }>
}

export default async function MatchesPage({ searchParams }: Props) {
  const { category, sub, tool } = await searchParams
  const caller = await api()

  const [categoryGroups, toolNames] = await Promise.all([
    caller.category.listGroups(),
    caller.tool.listNames(),
  ])

  const groups = categoryGroups.map((g) => ({
    slug: g.slug,
    name: g.name,
    subcategories: g.subcategories.map((s) => ({ slug: s.slug, name: s.name })),
  }))

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-xl font-bold tracking-tight">Live Matches</h1>

      <Suspense fallback={null}>
        <MatchFilters
          groups={groups}
          tools={toolNames}
          currentGroup={category}
          currentSub={sub}
          currentTool={tool}
        />
      </Suspense>

      <div className="mt-6">
        <MatchesPageContent
          initialGroupSlug={sub ? undefined : category}
          initialCategorySlug={sub}
          initialToolSlug={tool}
        />
      </div>
    </div>
  )
}
