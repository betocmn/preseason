import { TRPCError } from '@trpc/server'
import { Bot } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { EmptyState } from '~/components/public/empty-state'
import { RecommendationCard } from '~/components/public/recommendation-card'
import { api } from '~/trpc/server'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const caller = await api()
    const llm = await caller.llm.getBySlug({ slug })
    return {
      title: `${llm.name} | Preseason`,
      description: `See what tools ${llm.name} recommends across categories.`,
    }
  } catch {
    return { title: 'LLM | Preseason' }
  }
}

export default async function LlmDetailPage({ params }: Props) {
  const { slug } = await params
  const caller = await api()

  let llm
  try {
    llm = await caller.llm.getBySlug({ slug })
  } catch (error) {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
    throw error
  }

  const feed = await caller.recommendation.getFeed({
    limit: 50,
    offset: 0,
    llmSlug: slug,
  })

  // Group by category
  const byCategory = new Map<string, typeof feed.items>()
  for (const item of feed.items) {
    const key = item.category.slug
    const existing = byCategory.get(key) ?? []
    existing.push(item)
    byCategory.set(key, existing)
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          <Bot className="h-6 w-6" />
          <h1 className="text-2xl font-bold">{llm.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{llm.provider}</Badge>
          <span className="text-sm text-muted-foreground">{llm.modelId}</span>
        </div>
      </div>

      <h2 className="mb-4 text-lg font-semibold">Recommendations by Category</h2>

      {byCategory.size > 0 ? (
        <div className="space-y-8">
          {Array.from(byCategory.entries()).map(([categorySlug, items]) => (
            <Card key={categorySlug}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{items[0]?.category.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.slice(0, 5).map((item) => (
                  <RecommendationCard
                    key={item.id}
                    id={item.id}
                    confidence={item.confidence}
                    reasoning={item.reasoning}
                    tool={item.tool}
                    category={item.category}
                    llm={item.llm}
                    prompt={item.prompt}
                    createdAt={item.createdAt}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Bot className="h-10 w-10" />}
          title="No recommendations yet"
          description={`${llm.name} hasn't produced any recommendations yet. Check back after runs complete.`}
        />
      )}
    </div>
  )
}
