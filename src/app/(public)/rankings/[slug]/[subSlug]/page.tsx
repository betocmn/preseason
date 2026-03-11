import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EmptyState } from '~/components/public/empty-state'
import { RankingTable } from '~/components/public/ranking-table'
import { SidebarLayout } from '~/components/public/sidebar-layout'
import { Badge } from '~/components/ui/badge'
import { api } from '~/trpc/server'

type Props = {
  params: Promise<{ slug: string; subSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { subSlug } = await params
  const caller = await api()
  const data = await caller.benchmarkRanking.byCategory({ categorySlug: subSlug })

  if (!data.category) {
    return { title: 'Category Not Found' }
  }

  const title = `${data.category.name} Rankings`
  const description = `Benchmark rankings for tools in the ${data.category.name} subcategory.`
  return {
    title,
    description,
    openGraph: { title, description, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function SubcategoryRankingPage({ params }: Props) {
  const { slug, subSlug } = await params
  const caller = await api()
  const [data, groups] = await Promise.all([
    caller.benchmarkRanking.byCategory({ categorySlug: subSlug }),
    caller.category.listGroups(),
  ])

  if (!data.category) {
    notFound()
  }
  if (data.category.categoryGroup.slug !== slug) {
    notFound()
  }

  return (
    <SidebarLayout groups={groups} section="rankings">
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
      <h2 className="mb-4 text-lg font-semibold">{data.category.name}</h2>
      {data.ranking && data.ranking.items.length > 0 ? (
        <RankingTable
          items={data.ranking.items}
          meetsPublicationThreshold={data.ranking.meetsPublicationThreshold}
        />
      ) : (
        <EmptyState
          title={`No benchmark data for ${data.category.name} yet`}
          description="Rankings are computed from published benchmark runs. Check back after runs have completed."
        />
      )}
    </SidebarLayout>
  )
}
