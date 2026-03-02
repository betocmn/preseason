import type { Metadata } from 'next'
import { MatchesPageContent } from '~/components/public/matches-page-content'
import { SidebarLayout } from '~/components/public/sidebar-layout'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Live Matches | Preseason',
  description: 'Head-to-head tool battles based on LLM recommendations.',
}

type Props = {
  searchParams: Promise<{ category?: string; sub?: string }>
}

export default async function MatchesPage({ searchParams }: Props) {
  const { category, sub } = await searchParams
  const caller = await api()
  const groups = await caller.category.listGroups()

  return (
    <SidebarLayout groups={groups} section="matches">
      <h1 className="mb-6 text-xl font-bold tracking-tight">Live Matches</h1>
      <MatchesPageContent initialCategorySlug={sub ?? category} />
    </SidebarLayout>
  )
}
