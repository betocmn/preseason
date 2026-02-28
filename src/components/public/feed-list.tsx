'use client'

import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { EmptyState } from '~/components/public/empty-state'
import { LoadMoreButton } from '~/components/public/load-more-button'
import { RecommendationCard } from '~/components/public/recommendation-card'
import { api } from '~/trpc/react'

type Category = { id: string; name: string; slug: string }
type Llm = { id: string; name: string; slug: string }

type FeedListProps = {
  categories: Category[]
  llms: Llm[]
}

const PAGE_SIZE = 20

export function FeedList({ categories, llms }: FeedListProps) {
  const [categorySlug, setCategorySlug] = useState<string | undefined>()
  const [llmSlug, setLlmSlug] = useState<string | undefined>()
  const [limit, setLimit] = useState(PAGE_SIZE)

  const { data, isLoading } = api.recommendation.getFeed.useQuery({
    limit,
    offset: 0,
    categorySlug: categorySlug || undefined,
    llmSlug: llmSlug || undefined,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const hasMore = items.length < total

  return (
    <div>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3">
        <Select
          value={categorySlug ?? 'all'}
          onValueChange={(v) => {
            setCategorySlug(v === 'all' ? undefined : v)
            setLimit(PAGE_SIZE)
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.slug}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={llmSlug ?? 'all'}
          onValueChange={(v) => {
            setLlmSlug(v === 'all' ? undefined : v)
            setLimit(PAGE_SIZE)
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All LLMs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All LLMs</SelectItem>
            {llms.map((llm) => (
              <SelectItem key={llm.id} value={llm.slug}>
                {llm.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Feed */}
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
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
        </div>
      ) : (
        !isLoading && (
          <EmptyState
            title="No recommendations found"
            description="Try adjusting your filters or check back after the next run."
          />
        )
      )}

      <LoadMoreButton
        onLoadMore={() => setLimit((prev) => prev + PAGE_SIZE)}
        hasMore={hasMore}
        isLoading={isLoading}
      />
    </div>
  )
}
