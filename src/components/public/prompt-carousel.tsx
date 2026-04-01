'use client'

import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useRef, useState } from 'react'
import {
  getNextPromptIndexAfterLoad,
  shouldPrefetchPromptPage,
} from '~/components/public/prompt-carousel-state'
import { ToolBadge } from '~/components/public/tool-badge'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { formatPromptLevel } from '~/lib/prompt-levels'
import { cn } from '~/lib/utils'
import { api } from '~/trpc/react'

type PromptWithTools = {
  id: string
  title: string
  slug: string
  content: string | null
  description: string | null
  level: string
  topTools: {
    tool: { id: string; name: string; slug: string; logoUrl: string | null }
    rate: number
    count: number
  }[]
}

const PAGE_SIZE = 5

type PromptCarouselProps = {
  initialPrompts: PromptWithTools[]
  initialHasMore: boolean
  anchorDate: string
  snapshot: PromptListSnapshot
}

type PromptListSnapshot = {
  seasonId: string
  publishedRunIds: string[]
}

type PromptPageResult = {
  items: PromptWithTools[]
  hasMore: boolean
  snapshot: PromptListSnapshot | null
}

export function PromptCarousel({
  initialPrompts,
  initialHasMore,
  anchorDate,
  snapshot,
}: PromptCarouselProps) {
  const [prompts, setPrompts] = useState<PromptWithTools[]>(initialPrompts)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const inFlightLoadRef = useRef<Promise<PromptPageResult | undefined> | null>(null)

  const utils = api.useUtils()

  const loadMore = useCallback(async () => {
    if (inFlightLoadRef.current) {
      return inFlightLoadRef.current
    }

    if (!hasMore) return

    setIsLoadingMore(true)
    const request = (async () => {
      const result = await utils.prompt.listWithTopTools.fetch({
        limit: PAGE_SIZE,
        offset: prompts.length,
        anchorDate,
        snapshot,
      })
      setPrompts((prev) => [...prev, ...result.items])
      setHasMore(result.hasMore)
      return result
    })()

    inFlightLoadRef.current = request

    void request.finally(() => {
      if (inFlightLoadRef.current === request) {
        inFlightLoadRef.current = null
      }
      setIsLoadingMore(false)
    })

    return request
  }, [anchorDate, hasMore, prompts.length, snapshot, utils])

  const goNext = useCallback(async () => {
    const nextIndex = currentIndex + 1

    if (nextIndex < prompts.length) {
      setCurrentIndex(nextIndex)

      if (
        shouldPrefetchPromptPage({
          nextIndex,
          loadedPromptCount: prompts.length,
          hasMore,
          isLoadingMore,
        })
      ) {
        void loadMore()
      }

      return
    }

    const result = await loadMore()
    if (!result) return

    setCurrentIndex(
      getNextPromptIndexAfterLoad({
        currentIndex,
        loadedPromptCount: prompts.length,
        fetchedPromptCount: result.items.length,
      }),
    )
  }, [currentIndex, prompts.length, hasMore, isLoadingMore, loadMore])

  const goToIndex = useCallback(
    (index: number) => {
      setCurrentIndex(index)

      if (
        shouldPrefetchPromptPage({
          nextIndex: index,
          loadedPromptCount: prompts.length,
          hasMore,
          isLoadingMore,
        })
      ) {
        void loadMore()
      }
    },
    [hasMore, isLoadingMore, loadMore, prompts.length],
  )

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0))
  }, [])

  if (prompts.length === 0) return null

  const hasPrev = currentIndex > 0
  const canGoNext = currentIndex < prompts.length - 1 || hasMore

  return (
    <div className="flex flex-col rounded-lg border bg-card">
      {/* All slides stacked in a grid so the tallest sets the height */}
      <div className="grid flex-1">
        {prompts.map((prompt, i) => {
          const isActive = i === currentIndex
          return (
            <div
              key={prompt.id}
              className={cn(
                'group/prompt relative col-start-1 row-start-1 rounded-t-lg p-5 transition-colors',
                isActive ? 'visible hover:bg-secondary/50' : 'invisible',
              )}
            >
              {/* Two-column: prompt text left, recommendations right */}
              <div className="relative z-0 grid gap-5 sm:grid-cols-2">
                {/* Left: prompt content */}
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[11px] font-normal text-muted-foreground"
                    >
                      {formatPromptLevel(prompt.level)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{currentIndex + 1}</span>
                  </div>
                  <h3 className="text-sm font-medium leading-snug group-hover/prompt:text-foreground">
                    {prompt.title}
                  </h3>
                  {(() => {
                    const isPromptContent = !!prompt.content
                    const promptText = prompt.content ?? prompt.description
                    return (
                      promptText && (
                        <p
                          className={cn(
                            'mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground',
                            isPromptContent && 'italic',
                          )}
                        >
                          {isPromptContent && <>&ldquo;</>}
                          {promptText}
                          {isPromptContent && <>&rdquo;</>}
                        </p>
                      )
                    )
                  })()}
                </div>

                {/* Right: top tools */}
                {prompt.topTools.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Top recommendations
                    </p>
                    {prompt.topTools.map(({ tool, rate }) => {
                      const pct = rate * 100

                      return (
                        <div key={tool.id} className="flex items-center gap-3">
                          <div className="relative z-20 w-28 shrink-0">
                            <ToolBadge
                              name={tool.name}
                              slug={tool.slug}
                              logoUrl={tool.logoUrl}
                              size="sm"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-muted-foreground/30 transition-all"
                                style={{ width: `${Math.max(pct, 3)}%` }}
                              />
                            </div>
                            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {/* Card-level link overlay */}
              {isActive && (
                <Link
                  href={`/prompts/${prompt.level}/${prompt.slug}`}
                  className="absolute inset-0 z-10 rounded-t-lg"
                  aria-label={prompt.title}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Navigation: arrows around dots */}
      {(prompts.length > 1 || hasMore) && (
        <div className="flex items-center justify-between border-t px-5 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              disabled={!hasPrev}
              onClick={goPrev}
              className="h-6 w-6 text-muted-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <div className="flex items-center gap-1.5">
              {prompts.map((_, i) => (
                <button
                  type="button"
                  key={prompts[i]?.id ?? i}
                  onClick={() => goToIndex(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === currentIndex
                      ? 'w-4 bg-muted-foreground/50'
                      : 'w-1.5 bg-muted-foreground/20',
                  )}
                />
              ))}
              {hasMore && <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/10" />}
            </div>
            <Button
              variant="ghost"
              size="icon"
              disabled={!canGoNext || isLoadingMore}
              onClick={goNext}
              className="h-6 w-6 text-muted-foreground"
            >
              {isLoadingMore ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          <Link href="/prompts" className="text-xs text-muted-foreground/70 hover:text-foreground">
            View all prompts
          </Link>
        </div>
      )}
    </div>
  )
}
