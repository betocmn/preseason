import { createOgImage, OG_CONTENT_TYPE, OG_SIZE } from '~/lib/og'
import { isPromptLevel } from '~/server/llm/prompts'
import { publicApi } from '~/trpc/server'

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
    const caller = await publicApi()
    const prompt = await caller.prompt.getBySlug({ slug, level })
    return createOgImage(prompt.title, prompt.description ?? 'Vibe-coding prompt benchmark')
  } catch {
    return createOgImage('Prompt', 'Preseason')
  }
}
