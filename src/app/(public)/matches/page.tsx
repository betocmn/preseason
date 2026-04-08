export const revalidate = 3600 // 1 hour

import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { MatchesPageContent } from '~/components/public/matches-page-content'
import { deferToRequestWhenDatabaseUnavailable } from '~/server/prerender'
import { publicApi } from '~/trpc/server'

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

export default async function MatchesPage() {
  await deferToRequestWhenDatabaseUnavailable()
  const caller = await publicApi()
  const matchups = await caller.benchmarkMatch.listFeatured()

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

      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading matches...</p>}>
        <MatchesPageContent initialItems={matchups} />
      </Suspense>
    </div>
  )
}
