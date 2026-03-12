'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { ToolBadge } from '~/components/public/tool-badge'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

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

  return (
    <div className="flex flex-col rounded-lg border bg-card">
      <div className="group/prompt relative flex-1 rounded-t-lg p-5 transition-colors hover:bg-secondary/50">
        {/* Two-column: prompt text left, recommendations right */}
        <div className="relative z-0 grid gap-5 sm:grid-cols-2">
          {/* Left: prompt content */}
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                {formatLevel(current.level)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {currentIndex + 1} of {prompts.length}
              </span>
            </div>
            <h3 className="text-sm font-medium leading-snug group-hover/prompt:text-foreground">
              {current.title}
            </h3>
            {(() => {
              const isPromptContent = !!current.content
              const promptText = current.content ?? current.description
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
          {current.topTools.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Top recommendations
              </p>
              {current.topTools.map(({ tool, rate }) => {
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
        <Link
          href={`/prompts/${current.level}/${current.slug}`}
          className="absolute inset-0 z-10 rounded-t-lg"
          aria-label={current.title}
        />
      </div>

      {/* Navigation: arrows around dots */}
      {prompts.length > 1 && (
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
                  onClick={() => setCurrentIndex(i)}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === currentIndex
                      ? 'w-4 bg-muted-foreground/50'
                      : 'w-1.5 bg-muted-foreground/20',
                  )}
                />
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon"
              disabled={!hasNext}
              onClick={goNext}
              className="h-6 w-6 text-muted-foreground"
            >
              <ChevronRight className="h-3.5 w-3.5" />
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
