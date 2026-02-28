import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CategorySidebar } from '~/components/public/category-sidebar'
import { EmptyState } from '~/components/public/empty-state'
import { RankingTable } from '~/components/public/ranking-table'
import { api } from '~/trpc/server'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const caller = await api()
  const ranking = await caller.ranking.byCategorySlug({ categorySlug: slug, days: 30 })

  if (!ranking.category) {
    return { title: 'Category Not Found | Preseason' }
  }

  return {
    title: `${ranking.category.name} Rankings | Preseason`,
    description: `Top tools recommended by LLMs in the ${ranking.category.name} category.`,
  }
}

export default async function CategoryRankingPage({ params }: Props) {
  const { slug } = await params
  const caller = await api()
  const [ranking, categories] = await Promise.all([
    caller.ranking.byCategorySlug({ categorySlug: slug, days: 30 }),
    caller.category.list(),
  ])

  if (!ranking.category) {
    notFound()
  }

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-2xl font-bold">Rankings</h1>
      <div className="flex gap-8">
        <aside className="hidden w-48 shrink-0 md:block">
          <CategorySidebar categories={categories} activeSlug={slug} basePath="/rankings" />
        </aside>
        <div className="min-w-0 flex-1">
          <h2 className="mb-4 text-lg font-semibold">{ranking.category.name} (30 days)</h2>
          {ranking.items.length > 0 ? (
            <RankingTable items={ranking.items} />
          ) : (
            <EmptyState
              title={`No tools ranked in ${ranking.category.name} yet`}
              description="Rankings appear after LLM runs produce recommendations in this category."
            />
          )}
        </div>
      </div>
    </div>
  )
}
