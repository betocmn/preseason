import type { Metadata } from 'next'
import { CategorySidebar } from '~/components/public/category-sidebar'
import { EmptyState } from '~/components/public/empty-state'
import { RankingTable } from '~/components/public/ranking-table'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Rankings | Preseason',
  description: 'See which tools LLMs recommend most across all categories.',
}

export default async function RankingsPage() {
  const caller = await api()
  const [ranking, categories] = await Promise.all([
    caller.ranking.overall({ days: 30, limit: 50 }),
    caller.category.list(),
  ])

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-2xl font-bold">Rankings</h1>
      <div className="flex gap-8">
        <aside className="hidden w-48 shrink-0 md:block">
          <CategorySidebar categories={categories} basePath="/rankings" />
        </aside>
        <div className="min-w-0 flex-1">
          <h2 className="mb-4 text-lg font-semibold">Overall Rankings (30 days)</h2>
          {ranking.items.length > 0 ? (
            <RankingTable items={ranking.items} showCategoryCoverage />
          ) : (
            <EmptyState
              title="No ranking data yet"
              description="Rankings are computed from recommendation runs. Check back after runs have completed."
            />
          )}
        </div>
      </div>
    </div>
  )
}
