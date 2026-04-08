'use client'

import type { inferRouterOutputs } from '@trpc/server'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { EmptyState } from '~/components/public/empty-state'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { formatPromptLevel } from '~/lib/prompt-levels'
import { promptLevelEnum } from '~/server/db/schema'
import type { AppRouter } from '~/server/api/root'
import { api } from '~/trpc/react'

type PromptItem = inferRouterOutputs<AppRouter>['prompt']['listActive'][number]

type PromptsPageContentProps = {
  initialItems: PromptItem[]
}

function normalizePromptFilters(searchParams: URLSearchParams) {
  const level = searchParams.get('level') ?? undefined
  const group = searchParams.get('group') ?? undefined
  const sub = searchParams.get('sub') ?? undefined
  const validLevels = promptLevelEnum.enumValues
  const safeLevel =
    level && validLevels.includes(level)
      ? (level as (typeof promptLevelEnum.enumValues)[number])
      : undefined
  const safeStr = (value: string | undefined) =>
    value && value.length >= 1 && value.length <= 100 ? value : undefined

  return {
    level: safeLevel,
    group: safeStr(group),
    sub: safeStr(sub),
  }
}

export function PromptsPageContent({ initialItems }: PromptsPageContentProps) {
  const searchParams = useSearchParams()
  const filters = normalizePromptFilters(new URLSearchParams(searchParams.toString()))
  const hasFilters = !!filters.level || !!filters.group || !!filters.sub

  const { data, isFetching } = api.prompt.listActive.useQuery(filters, {
    enabled: hasFilters,
  })

  if (hasFilters && !data && isFetching) {
    return <p className="text-sm text-muted-foreground">Loading prompts...</p>
  }

  const items = hasFilters ? (data ?? []) : initialItems

  return items.length > 0 ? (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((prompt) => (
        <Card key={prompt.id} className="group relative transition-colors hover:bg-accent/50">
          <CardContent className="p-4">
            <Badge variant="outline" className="mb-2 text-[11px] font-normal">
              {formatPromptLevel(prompt.level)}
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
  )
}
