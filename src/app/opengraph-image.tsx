import { createHomepageOgImage, OG_CONTENT_TYPE, OG_SQUARE_SIZE } from '~/lib/og'

export const size = OG_SQUARE_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = 'Preseason — The devtools AI chooses.'

export default function Image() {
  return createHomepageOgImage('square')
}
