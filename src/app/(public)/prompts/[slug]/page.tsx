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

  const preferred = prompts.find((prompt) => prompt.level === 'vibe-coder') ?? prompts[0]
  if (!preferred) notFound()

  redirect(`/prompts/${preferred.level}/${preferred.slug}`)
}
