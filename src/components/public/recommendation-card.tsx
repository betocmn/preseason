import { Bot, FileText } from 'lucide-react'
import Link from 'next/link'
import { CategoryPill } from '~/components/public/category-pill'
import { ToolBadge } from '~/components/public/tool-badge'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { cn } from '~/lib/utils'

type RecommendationCardProps = {
  id: string
  confidence: number | null
  reasoning: string | null
  tool: { id: string; name: string; slug: string }
  category: { id: string; name: string; slug: string }
  llm: { id: string; name: string; slug: string }
  prompt: { id: string; title: string; slug: string }
  createdAt: Date | null
  className?: string
}

function timeAgo(date: Date | null) {
  if (!date) return ''
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function RecommendationCard({
  confidence,
  reasoning,
  tool,
  category,
  llm,
  prompt,
  createdAt,
  className,
}: RecommendationCardProps) {
  return (
    <Card className={cn('transition-colors hover:bg-accent/50', className)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <ToolBadge name={tool.name} slug={tool.slug} />
              <CategoryPill name={category.name} slug={category.slug} />
            </div>
            <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Bot className="h-3 w-3" />
                <Link href={`/llms/${llm.slug}`} className="hover:underline">
                  {llm.name}
                </Link>
              </span>
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3 w-3" />
                <Link href={`/prompts/${prompt.slug}`} className="hover:underline">
                  {prompt.title}
                </Link>
              </span>
            </div>
            {reasoning && <p className="line-clamp-2 text-sm text-muted-foreground">{reasoning}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            {confidence !== null && (
              <Badge variant="outline" className="text-xs">
                {Math.round(confidence * 100)}%
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{timeAgo(createdAt)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
