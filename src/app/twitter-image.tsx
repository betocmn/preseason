import { createHomepageOgImage, OG_CONTENT_TYPE, OG_SIZE } from '~/lib/og'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Preseason — The devtools AI chooses. LLM recommendations, ranked.'

export default function Image() {
  return createHomepageOgImage('wide')
}
