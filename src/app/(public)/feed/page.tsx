import type { Metadata } from 'next'
import { FeedList } from '~/components/public/feed-list'
import { Badge } from '~/components/ui/badge'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Feed',
  description: 'Browse the latest LLM tool recommendations from vibe-coding prompts.',
  openGraph: {
    title: 'Feed',
    description: 'Browse the latest LLM tool recommendations from vibe-coding prompts.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Feed',
    description: 'Browse the latest LLM tool recommendations from vibe-coding prompts.',
  },
}

export default async function FeedPage() {
  const caller = await api()
  const [categories, llms] = await Promise.all([caller.category.list(), caller.llm.listActive()])

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">Recommendation Feed</h1>
        <Badge variant="outline" className="text-xs">
          Exploration
        </Badge>
      </div>
      <FeedList categories={categories} llms={llms} />
    </div>
  )
}
