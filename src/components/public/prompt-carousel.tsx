'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useState } from 'react'
import { ToolBadge } from '~/components/public/tool-badge'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

type PromptWithTools = {
  id: string
  title: string
  slug: string
  description: string | null
  level: string
  topTools: {
    tool: { id: string; name: string; slug: string; logoUrl: string | null }
    rate: number
    count: number
  }[]
}

type PromptCarouselProps = {
  prompts: PromptWithTools[]
}

function formatLevel(level: string): string {
  return level
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function PromptCarousel({ prompts }: PromptCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  const goNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, prompts.length - 1))
  }, [prompts.length])

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0))
  }, [])

  if (prompts.length === 0) return null

  const current = prompts[currentIndex]
  if (!current) return null

  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < prompts.length - 1

  const maxRate = Math.max(...current.topTools.map((t) => t.rate), 0.01)

  return (
    <div className="relative rounded-lg border bg-card">
      <div className="flex items-stretch">
        {/* Left arrow region */}
        <div className="flex shrink-0 items-center border-r px-1">
          <Button
            variant="ghost"
            size="icon"
            disabled={!hasPrev}
            onClick={goPrev}
            className="h-8 w-8 text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* Card content */}
        <div className="min-w-0 flex-1 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                  {formatLevel(current.level)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {currentIndex + 1} of {prompts.length}
                </span>
              </div>
              <h3 className="text-base font-medium leading-snug">{current.title}</h3>
              {current.description && (
                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">
                  {current.description}
                </p>
              )}
            </div>
          </div>

          {/* Top tools with rate bars */}
          {current.topTools.length > 0 && (
            <div className="mt-5 space-y-2.5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Top recommendations
              </p>
              {current.topTools.map(({ tool, rate }) => {
                const pct = rate * 100
                const barWidth = (rate / maxRate) * 100

                return (
                  <div key={tool.id} className="flex items-center gap-3">
                    <div className="w-28 shrink-0">
                      <ToolBadge
                        name={tool.name}
                        slug={tool.slug}
                        logoUrl={tool.logoUrl}
                        size="sm"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-chart-a transition-all"
                            style={{ width: `${Math.max(barWidth, 2)}%` }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                          {pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Dot indicators */}
          {prompts.length > 1 && (
            <div className="mt-4 flex items-center justify-center gap-1.5">
              {prompts.map((_, i) => (
                <button
                  type="button"
                  key={prompts[i]?.id ?? i}
                  onClick={() => setCurrentIndex(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === currentIndex ? 'w-4 bg-chart-a' : 'w-1.5 bg-muted-foreground/30',
                  )}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right arrow region */}
        <div className="flex shrink-0 items-center border-l px-1">
          <Button
            variant="ghost"
            size="icon"
            disabled={!hasNext}
            onClick={goNext}
            className="h-8 w-8 text-muted-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
