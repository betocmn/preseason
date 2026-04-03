import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '~/lib/og'
import { api } from '~/trpc/server'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await api()
  const data = await caller.benchmarkRanking.byCategoryGroup({ groupSlug: slug })

  const name = data.categoryGroup?.name ?? 'Category'
  return createOgImage(`${name} Rankings`, 'Benchmark rankings powered by LLM recommendations')
}
