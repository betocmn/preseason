import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { BenchmarkRankingFilters } from '~/components/public/benchmark-ranking-filters'
import { RankingIndex } from '~/components/public/ranking-index'
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

  const validPromptTier = (['basic', 'intermediate', 'advanced'] as const).find(
    (t) => t === promptTier,
  )
  const validModelTier = (['frontier', 'mid', 'small'] as const).find((t) => t === modelTier)
  const showIndex = !category && !sub
  const indexGroups = showIndex
    ? await Promise.all(
        groups.map(async (group) => {
          const data = await caller.benchmarkRanking.byCategoryGroup({
            groupSlug: group.slug,
            promptTier: validPromptTier,
            modelTier: validModelTier,
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
        {showIndex ? (
          <RankingIndex groups={indexGroups} />
        ) : (
          <RankingsPageContent
            currentGroup={category}
            currentSub={sub}
            promptTier={validPromptTier}
            modelTier={validModelTier}
          />
        )}
      </div>
    </div>
  )
}
