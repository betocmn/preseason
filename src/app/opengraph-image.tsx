import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '~/lib/og'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image() {
  return createOgImage('Preseason', 'Track what tools LLMs recommend for vibe-coding prompts')
}
