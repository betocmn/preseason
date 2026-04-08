export const revalidate = 3600 // 1 hour

import type { Metadata } from 'next'
import Link from 'next/link'
import { MatchesPageContent } from '~/components/public/matches-page-content'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Matches',
  description: 'Benchmark match-ups between top tools based on LLM recommendations.',
  openGraph: {
    title: 'Matches',
    description: 'Benchmark match-ups between top tools based on LLM recommendations.',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Matches',
    description: 'Benchmark match-ups between top tools based on LLM recommendations.',
    images: ['/opengraph-image'],
  },
}

type Props = {
  searchParams: Promise<{ category?: string }>
}

export default async function MatchesPage({ searchParams }: Props) {
  const { category } = await searchParams
  const caller = await api()
  const matchups = await caller.benchmarkMatch.listFeatured(
    category ? { categorySlug: category } : undefined,
  )

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">Matches</h1>
        <Link
          href="/methodology"
          className="ml-auto text-sm text-muted-foreground hover:text-foreground"
        >
          Methodology
        </Link>
      </div>

      <p className="mb-6 text-sm text-muted-foreground">
        Auto-generated matchups between the top tools in each category, based on benchmark case
        decisions.
      </p>

      <MatchesPageContent items={matchups} />
    </div>
  )
}
