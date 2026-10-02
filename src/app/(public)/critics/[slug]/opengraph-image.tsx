import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '~/lib/og'
import { getCriticMetadata } from '~/server/public-metadata'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  try {
    const critic = await getCriticMetadata(slug)
    if (!critic) return createOgImage('Critic', 'Preseason')
    return createOgImage(critic.displayName, critic.bio ?? 'Verified Preseason critic')
  } catch {
    return createOgImage('Critic', 'Preseason')
  }
}
