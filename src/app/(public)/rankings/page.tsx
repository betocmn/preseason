import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { BenchmarkRankingFilters } from '~/components/public/benchmark-ranking-filters'
import { RankingsPageContent } from '~/components/public/rankings-page-content'
import { Badge } from '~/components/ui/badge'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Rankings',
  description: 'Benchmark-grade rankings of tools recommended by LLMs across all categories.',
  openGraph: {
    title: 'Rankings',
    description: 'Benchmark-grade rankings of tools recommended by LLMs across all categories.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rankings',
    description: 'Benchmark-grade rankings of tools recommended by LLMs across all categories.',
  },
}

type Props = {
  searchParams: Promise<{
    category?: string
    sub?: string
    promptTier?: string
    modelTier?: string
  }>
}

export default async function RankingsPage({ searchParams }: Props) {
  const { category, sub, promptTier, modelTier } = await searchParams
  const caller = await api()
  const categoryGroups = await caller.category.listGroups()

  const groups = categoryGroups.map((g) => ({
    slug: g.slug,
    name: g.name,
    subcategories: g.subcategories.map((s) => ({ slug: s.slug, name: s.name })),
  }))

  // Default to first subcategory when no filter selected
  const defaultSubcategorySlug = groups[0]?.subcategories[0]?.slug

  const validPromptTier = (['basic', 'intermediate', 'advanced'] as const).find(
    (t) => t === promptTier,
  )
  const validModelTier = (['frontier', 'mid', 'small'] as const).find((t) => t === modelTier)

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">Rankings</h1>
        <Badge variant="secondary" className="text-xs">
          Benchmark
        </Badge>
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
          currentGroup={category}
          currentSub={sub}
          currentPromptTier={validPromptTier}
          currentModelTier={validModelTier}
        />
      </Suspense>

      <div className="mt-6">
        <RankingsPageContent
          currentGroup={category}
          currentSub={sub}
          promptTier={validPromptTier}
          modelTier={validModelTier}
          defaultSubcategorySlug={defaultSubcategorySlug}
        />
      </div>
    </div>
  )
}
