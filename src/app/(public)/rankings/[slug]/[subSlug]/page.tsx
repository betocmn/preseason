import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { EmptyState } from '~/components/public/empty-state'
import { RankingTable } from '~/components/public/ranking-table'
import { SidebarLayout } from '~/components/public/sidebar-layout'
import { api } from '~/trpc/server'

type Props = {
  params: Promise<{ slug: string; subSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subSlug } = await params
  const caller = await api()
  const ranking = await caller.ranking.bySubcategorySlug({
    subcategorySlug: subSlug,
    days: 30,
  })

  if (!ranking.category) {
    return { title: 'Category Not Found | Preseason' }
  }

  return {
    title: `${ranking.category.name} Rankings | Preseason`,
    description: `Top tools recommended by LLMs in the ${ranking.category.name} subcategory.`,
  }
}

export default async function SubcategoryRankingPage({ params }: Props) {
  const { slug, subSlug } = await params
  const caller = await api()
  const [ranking, groups] = await Promise.all([
    caller.ranking.bySubcategorySlug({ subcategorySlug: subSlug, days: 30 }),
    caller.category.listGroups(),
  ])

  if (!ranking.category) {
    notFound()
  }
  if (ranking.category.categoryGroup.slug !== slug) {
    notFound()
  }

  return (
    <SidebarLayout groups={groups} section="rankings">
      <h1 className="mb-6 text-xl font-bold tracking-tight">Rankings</h1>
      <h2 className="mb-4 text-lg font-semibold">{ranking.category.name} (30 days)</h2>
      {ranking.items.length > 0 ? (
        <RankingTable items={ranking.items} />
      ) : (
        <EmptyState
          title={`No tools ranked in ${ranking.category.name} yet`}
          description="Rankings appear after LLM runs produce recommendations in this category."
        />
      )}
    </SidebarLayout>
  )
}
