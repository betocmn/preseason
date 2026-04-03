import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '~/lib/og'
import { api } from '~/trpc/server'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; subSlug: string }>
}) {
  const { slug, subSlug } = await params

  try {
    const caller = await api()
    const data = await caller.benchmarkRanking.byCategory({ categorySlug: subSlug })

    if (!data.category || data.category.categoryGroup.slug !== slug) {
      return createOgImage('Rankings', 'Preseason')
    }

    return createOgImage(
      `${data.category.name} Rankings`,
      'Benchmark rankings powered by LLM recommendations',
    )
  } catch {
    return createOgImage('Rankings', 'Preseason')
  }
}
