import type { Metadata } from 'next'
import { EmptyState } from '~/components/public/empty-state'
import { RankingTable } from '~/components/public/ranking-table'
import { SidebarLayout } from '~/components/public/sidebar-layout'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Rankings | Preseason',
  description: 'See which tools LLMs recommend most across all categories.',
}

export default async function RankingsPage() {
  const caller = await api()
  const [ranking, groups] = await Promise.all([
    caller.ranking.overall({ days: 30, limit: 50 }),
    caller.category.listGroups(),
  ])

  return (
    <SidebarLayout groups={groups} section="rankings">
      <h1 className="mb-6 text-xl font-bold tracking-tight">Rankings</h1>
      <h2 className="mb-4 text-lg font-semibold">Overall Rankings (30 days)</h2>
      {ranking.items.length > 0 ? (
        <RankingTable items={ranking.items} showCategoryCoverage />
      ) : (
        <EmptyState
          title="No ranking data yet"
          description="Rankings are computed from recommendation runs. Check back after runs have completed."
        />
      )}
    </SidebarLayout>
  )
}
