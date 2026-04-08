export const revalidate = 3600 // 1 hour

import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PromptsPageContent } from '~/components/public/prompts-page-content'
import { PromptFilters } from '~/components/public/prompt-filters'
import { promptLevelEnum } from '~/server/db/schema'
import { publicApi } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Prompts',
  description: 'Browse vibe-coding prompts used to generate tool recommendations.',
  openGraph: {
    title: 'Prompts',
    description: 'Browse vibe-coding prompts used to generate tool recommendations.',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Prompts',
    description: 'Browse vibe-coding prompts used to generate tool recommendations.',
    images: ['/opengraph-image'],
  },
}

export default async function PromptsPage() {
  const caller = await publicApi()

  const [activePrompts, categoryGroups] = await Promise.all([
    caller.prompt.listActive(),
    caller.category.listGroups(),
  ])

  const groups = categoryGroups.map((g) => ({
    slug: g.slug,
    name: g.name,
    subcategories: g.subcategories.map((s) => ({ slug: s.slug, name: s.name })),
  }))

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-xl font-bold tracking-tight">Prompts</h1>

      <Suspense fallback={null}>
        <PromptFilters groups={groups} levels={promptLevelEnum.enumValues} />
      </Suspense>

      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-muted-foreground">Loading prompts...</p>}>
          <PromptsPageContent initialItems={activePrompts} />
        </Suspense>
      </div>
    </div>
  )
}
