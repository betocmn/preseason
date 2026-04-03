import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '~/lib/og'
import { api } from '~/trpc/server'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const caller = await api()

  try {
    const tool = await caller.tool.getBySlug({ slug })
    return createOgImage(tool.name, tool.description ?? 'See how LLMs recommend this tool')
  } catch {
    return createOgImage('Tool', 'Preseason')
  }
}
