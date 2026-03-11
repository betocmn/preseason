import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EmptyState } from '~/components/public/empty-state'
import { RankingTable } from '~/components/public/ranking-table'
import { Badge } from '~/components/ui/badge'
import { SidebarLayout } from '~/components/public/sidebar-layout'
import { api } from '~/trpc/server'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const caller = await api()
  const data = await caller.benchmarkRanking.byCategoryGroup({ groupSlug: slug })

  if (!data.categoryGroup) {
    return { title: 'Category Not Found' }
  }

  const title = `${data.categoryGroup.name} Rankings`
  const description = `Benchmark rankings for tools in the ${data.categoryGroup.name} category.`
  return {
    title,
    description,
    openGraph: { title, description, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function CategoryGroupRankingPage({ params }: Props) {
  const { slug } = await params
  const caller = await api()
  const [data, groups] = await Promise.all([
    caller.benchmarkRanking.byCategoryGroup({ groupSlug: slug }),
    caller.category.listGroups(),
  ])

  if (!data.categoryGroup) {
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
      <h2 className="mb-4 text-lg font-semibold">{data.categoryGroup.name}</h2>
      {data.ranking && data.ranking.items.length > 0 ? (
        <RankingTable
          items={data.ranking.items}
          meetsPublicationThreshold={data.ranking.meetsPublicationThreshold}
        />
      ) : (
        <EmptyState
          title={`No benchmark data for ${data.categoryGroup.name} yet`}
          description="Rankings are computed from published benchmark runs. Check back after runs have completed."
        />
      )}
    </SidebarLayout>
  )
}
