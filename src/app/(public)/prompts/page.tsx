import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { EmptyState } from '~/components/public/empty-state'
import { PromptFilters } from '~/components/public/prompt-filters'
import { ToolBadge } from '~/components/public/tool-badge'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Prompts | Preseason',
  description: 'Browse vibe-coding prompts used to generate tool recommendations.',
}

function formatLevel(level: string): string {
  return level
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

type Props = {
  searchParams: Promise<{ level?: string; category?: string }>
}

export default async function PromptsPage({ searchParams }: Props) {
  const { level, category } = await searchParams
  const caller = await api()

  const [activePrompts, distinctCategories] = await Promise.all([
    caller.prompt.listActive(level || category ? { level: level as never, category } : undefined),
    caller.prompt.listExpectedCategories(),
  ])

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-xl font-bold tracking-tight">Prompts</h1>

      <Suspense fallback={null}>
        <PromptFilters
          categories={distinctCategories}
          currentLevel={level}
          currentCategory={category}
        />
      </Suspense>

      {activePrompts.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activePrompts.map((prompt) => (
            <Card key={prompt.id} className="group relative transition-colors hover:bg-accent/50">
              <CardContent className="p-4">
                <Badge variant="outline" className="mb-2 text-[11px] font-normal">
                  {formatLevel(prompt.level)}
                </Badge>
                <h3 className="font-medium">{prompt.title}</h3>
                {prompt.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {prompt.description}
                  </p>
                )}
                {prompt.expectedCategories && prompt.expectedCategories.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {prompt.expectedCategories.slice(0, 3).map((cat) => (
                      <Badge key={cat} variant="secondary" className="text-xs">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                )}
                {prompt.topTools.length > 0 && (
                  <div className="relative z-20 mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                    {prompt.topTools.slice(0, 4).map(({ tool }) => (
                      <ToolBadge
                        key={tool.id}
                        name={tool.name}
                        slug={tool.slug}
                        logoUrl={tool.logoUrl}
                        size="sm"
                      />
                    ))}
                  </div>
                )}
              </CardContent>
              <Link
                href={`/prompts/${prompt.level}/${prompt.slug}`}
                className="absolute inset-0 z-10 rounded-lg"
                aria-label={prompt.title}
              />
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No prompts found"
          description="Try adjusting your filters or check back later."
        />
      )}
    </div>
  )
}
