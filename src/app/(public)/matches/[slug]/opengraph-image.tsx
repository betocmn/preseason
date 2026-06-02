import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '~/lib/og'
import { publicApi } from '~/trpc/server'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

function parseMatchSlug(slug: string) {
  const separatorIndex = slug.indexOf('--')
  if (separatorIndex === -1) return null

  const categorySlug = slug.slice(0, separatorIndex)
  const rest = slug.slice(separatorIndex + 2)
  const vsIndex = rest.indexOf('-vs-')
  if (vsIndex === -1) return null

  const toolASlug = rest.slice(0, vsIndex)
  const toolBSlug = rest.slice(vsIndex + 4)
  if (!categorySlug || !toolASlug || !toolBSlug) return null
  if (toolASlug === toolBSlug) return null

  return { categorySlug, toolASlug, toolBSlug }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const parsed = parseMatchSlug(slug)

  if (!parsed) {
    return createOgImage('Match', 'Preseason')
  }

  try {
    const caller = await publicApi()
    const data = await caller.benchmarkMatch.headToHead(parsed)
    if (!data.toolA || !data.toolB) {
      return createOgImage('Match', 'Preseason')
    }
    const title = `${data.toolA.name} vs ${data.toolB.name}`
    const categoryName = data.category?.name ?? 'category'
    return createOgImage(title, `Benchmark head-to-head in ${categoryName}`)
  } catch {
    return createOgImage('Match', 'Preseason')
  }
}
