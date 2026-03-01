import type { Metadata } from 'next'
import { MatchesPageContent } from '~/components/public/matches-page-content'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Matches | Preseason',
  description: 'Head-to-head tool battles based on LLM recommendations.',
}

export default async function MatchesPage() {
  const caller = await api()
  const categories = await caller.category.list()

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-2xl font-bold">Matches</h1>
      <MatchesPageContent categories={categories} />
    </div>
  )
}
