import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '~/lib/og'
import { getToolMetadata } from '~/server/public-metadata'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  try {
    const tool = await getToolMetadata(slug)
    if (!tool) return createOgImage('Tool', 'Preseason')
    return createOgImage(tool.name, tool.description ?? 'See how LLMs recommend this tool')
  } catch {
    return createOgImage('Tool', 'Preseason')
  }
}
