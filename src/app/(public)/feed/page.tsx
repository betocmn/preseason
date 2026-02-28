import type { Metadata } from 'next'
import { FeedList } from '~/components/public/feed-list'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Feed | Preseason',
  description: 'Browse the latest LLM tool recommendations from vibe-coding prompts.',
}

export default async function FeedPage() {
  const caller = await api()
  const [categories, llms] = await Promise.all([
    caller.category.list(),
    caller.llm.listActive(),
  ])

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-2xl font-bold">Recommendation Feed</h1>
      <FeedList categories={categories} llms={llms} />
    </div>
  )
}
