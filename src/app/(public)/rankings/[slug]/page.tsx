import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EmptyState } from '~/components/public/empty-state'
import { RankingTable } from '~/components/public/ranking-table'
import { SidebarLayout } from '~/components/public/sidebar-layout'
import { api } from '~/trpc/server'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const caller = await api()
  const ranking = await caller.ranking.byCategorySlug({ categorySlug: slug, days: 30 })

  if (!ranking.categoryGroup) {
    return { title: 'Category Not Found | Preseason' }
  }

  return {
    title: `${ranking.categoryGroup.name} Rankings | Preseason`,
    description: `Top tools recommended by LLMs in the ${ranking.categoryGroup.name} category.`,
  }
}

export default async function CategoryGroupRankingPage({ params }: Props) {
  const { slug } = await params
  const caller = await api()
  const [ranking, groups] = await Promise.all([
    caller.ranking.byCategorySlug({ categorySlug: slug, days: 30 }),
    caller.category.listGroups(),
  ])

  if (!ranking.categoryGroup) {
    notFound()
  }

  return (
    <SidebarLayout groups={groups} section="rankings">
      <h1 className="mb-6 text-xl font-bold tracking-tight">Rankings</h1>
      <h2 className="mb-4 text-lg font-semibold">{ranking.categoryGroup.name} (30 days)</h2>
      {ranking.items.length > 0 ? (
        <RankingTable items={ranking.items} />
      ) : (
        <EmptyState
          title={`No tools ranked in ${ranking.categoryGroup.name} yet`}
          description="Rankings appear after LLM runs produce recommendations in this category."
        />
      )}
    </SidebarLayout>
  )
}
