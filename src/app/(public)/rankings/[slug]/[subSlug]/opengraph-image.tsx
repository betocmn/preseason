import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '~/lib/og'
import { getRankingCategoryMetadata } from '~/server/public-metadata'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; subSlug: string }>
}) {
  const { slug, subSlug } = await params

  try {
    const category = await getRankingCategoryMetadata(slug, subSlug)

    if (!category) {
      return createOgImage('Rankings', 'Preseason')
    }

    return createOgImage(
      `${category.name} Rankings`,
      'Benchmark rankings powered by LLM recommendations',
    )
  } catch {
    return createOgImage('Rankings', 'Preseason')
  }
}
