'use client'

import { ChevronDown, ChevronRight, Clock, Cpu, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LoadMoreButton } from '~/components/public/load-more-button'
import { Badge } from '~/components/ui/badge'
import { api, type RouterOutputs } from '~/trpc/react'

const PAGE_SIZE = 10

type Props = {
  promptId: string
}

type PromptRunItem = RouterOutputs['run']['listByPrompt']['items'][number]

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function statusVariant(status: string) {
  switch (status) {
    case 'completed':
      return 'secondary' as const
    case 'failed':
      return 'destructive' as const
    case 'running':
      return 'default' as const
    default:
      return 'outline' as const
  }
}

export function PromptRunsList({ promptId }: Props) {
  const [offset, setOffset] = useState(0)
  const [items, setItems] = useState<PromptRunItem[]>([])
  const [total, setTotal] = useState(0)
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  const prevPromptId = useRef(promptId)

  if (prevPromptId.current !== promptId) {
    prevPromptId.current = promptId
    setOffset(0)
    setItems([])
    setTotal(0)
    setExpandedRunId(null)
  }

  const { data, isLoading, isFetching } = api.run.listByPrompt.useQuery({
    promptId,
    limit: PAGE_SIZE,
    offset,
  })

  useEffect(() => {
    if (!data) return

    setTotal(data.total)
    setItems((prev) => {
      if (offset === 0) return data.items
      const existingIds = new Set(prev.map((item) => item.run.id))
      const next = data.items.filter((item) => !existingIds.has(item.run.id))
      return [...prev, ...next]
    })
  }, [data, offset])

  const hasMore = items.length < total

  if (!isLoading && items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No runs have been executed for this prompt yet.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isExpanded = expandedRunId === item.run.id
        return (
          <div key={item.run.id} className="rounded-lg border">
            <button
              type="button"
              onClick={() => setExpandedRunId(isExpanded ? null : item.run.id)}
              className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <Badge variant={statusVariant(item.run.status)}>{item.run.status}</Badge>
                <span className="text-muted-foreground">{formatDate(item.run.createdAt)}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1" title="LLMs">
                  <Cpu className="h-3.5 w-3.5" />
                  {item.llmCount}
                </span>
                <span className="flex items-center gap-1" title="Recommendations">
                  <Sparkles className="h-3.5 w-3.5" />
                  {item.totalRecommendations}
                </span>
                {item.run.trigger === 'manual' && (
                  <Badge variant="outline" className="text-xs">
                    manual
                  </Badge>
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t px-3 py-3 space-y-3">
                {item.results.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No results for this prompt in this run.
                  </p>
                ) : (
                  item.results.map((result) => (
                    <div key={result.id} className="rounded-md bg-muted/40 p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{result.llm.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              result.parseStatus === 'success'
                                ? 'secondary'
                                : result.parseStatus === 'failed'
                                  ? 'destructive'
                                  : 'outline'
                            }
                          >
                            {result.parseStatus}
                          </Badge>
                          {result.responseTimeMs !== null && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {(result.responseTimeMs / 1000).toFixed(1)}s
                            </span>
                          )}
                        </div>
                      </div>
                      {result.recommendations.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {result.recommendations.map((rec) => (
                            <Badge key={rec.id} variant="secondary" className="text-xs">
                              {rec.tool.name}
                              {rec.category ? ` (${rec.category.name})` : ''}
                              {rec.rank !== null ? ` #${rec.rank}` : ''}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )
      })}

      <LoadMoreButton
        onLoadMore={() => setOffset(items.length)}
        hasMore={hasMore}
        isLoading={isFetching}
      />
    </div>
  )
}
