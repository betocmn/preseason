import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '~/components/public/empty-state'
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

export default async function PromptsPage() {
  const caller = await api()
  const activePrompts = await caller.prompt.listActive()

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-xl font-bold tracking-tight">Prompts</h1>

      {activePrompts.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activePrompts.map((prompt) => (
            <Card key={prompt.id} className="transition-colors hover:bg-accent/50">
              <Link href={`/prompts/${prompt.level}/${prompt.slug}`}>
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
                </CardContent>
              </Link>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No prompts yet"
          description="Prompts are vibe-coding scenarios used to test what tools LLMs recommend."
        />
      )}
    </div>
  )
}
