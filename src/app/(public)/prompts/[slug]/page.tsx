import { notFound, redirect } from 'next/navigation'
import { api } from '~/trpc/server'

export default async function PromptSlugRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const caller = await api()
  const prompts = await caller.prompt.listBySlug({ slug })
  if (prompts.length === 0) notFound()

  // listBySlug returns results sorted by active status and level priority
  // (active first, then vibe-coder, then experienced, then beginner)
  // so the first result is always the preferred canonical variant
  const preferred = prompts[0]
  if (!preferred) notFound()

  redirect(`/prompts/${preferred.level}/${preferred.slug}`)
}
