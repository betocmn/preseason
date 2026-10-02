import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '~/lib/og'
import { isPromptLevel } from '~/server/llm/prompts'
import { getPromptMetadata } from '~/server/public-metadata'

export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({
  params,
}: {
  params: Promise<{ level: string; slug: string }>
}) {
  const { level, slug } = await params

  if (!isPromptLevel(level)) {
    return createOgImage('Prompt', 'Preseason')
  }

  try {
    const prompt = await getPromptMetadata(slug, level)
    if (!prompt) return createOgImage('Prompt', 'Preseason')
    return createOgImage(prompt.title, prompt.description ?? 'Vibe-coding prompt benchmark')
  } catch {
    return createOgImage('Prompt', 'Preseason')
  }
}
