export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

import { notFound, redirect } from 'next/navigation'
import { publicApi } from '~/trpc/server'

export default async function PromptSlugRedirectPage({
  params,
}: {
  params: Promise<{ level: string }>
}) {
  const { level: slug } = await params
  const caller = await publicApi()
  const prompts = await caller.prompt.listBySlug({ slug })
  if (prompts.length === 0) notFound()

  // listBySlug returns results sorted by active status and level priority
  // (active first, then beginner, then intermediate, then advanced)
  // so the first result is always the preferred canonical variant
  const preferred = prompts[0]
  if (!preferred) notFound()

  redirect(`/prompts/${preferred.level}/${preferred.slug}`)
}
