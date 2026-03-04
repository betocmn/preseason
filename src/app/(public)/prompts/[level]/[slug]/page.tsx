import { TRPCError } from '@trpc/server'
import { FileText } from 'lucide-react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CommentList } from '~/components/public/comment-list'
import { EmptyState } from '~/components/public/empty-state'
import { PromptRunsList } from '~/components/public/prompt-runs-list'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { isPromptLevel } from '~/server/llm/prompts'
import { api } from '~/trpc/server'

type Props = {
  params: Promise<{ level: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { level, slug } = await params
  if (!isPromptLevel(level)) return { title: 'Prompt | Preseason' }

  try {
    const caller = await api()
    const prompt = await caller.prompt.getBySlug({ slug, level })
    return {
      title: `${prompt.title} | Preseason`,
      description: prompt.description ?? `Prompt: ${prompt.title}`,
    }
  } catch {
    return { title: 'Prompt | Preseason' }
  }
}

export default async function PromptDetailPage({ params }: Props) {
  const { level, slug } = await params
  if (!isPromptLevel(level)) notFound()

  const caller = await api()
  const prompt = await (async () => {
    try {
      return await caller.prompt.getBySlug({ slug, level })
    } catch (error) {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
      throw error
    }
  })()

  const promptComments = await caller.comment.listByTarget({
    targetType: 'prompt',
    targetId: prompt.id,
  })

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">{prompt.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{prompt.level}</Badge>
          {prompt.isActive ? (
            <Badge variant="secondary" className="text-xs">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-trend-up" />
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              Inactive
            </Badge>
          )}
        </div>
      </div>

      {prompt.description && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{prompt.description}</p>
          </CardContent>
        </Card>
      )}

      {prompt.expectedCategories && prompt.expectedCategories.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Expected Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {prompt.expectedCategories.map((cat) => (
                <Badge key={cat} variant="secondary">
                  {cat}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {prompt.content ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Prompt Content</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm">
              {prompt.content}
            </pre>
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={<FileText className="h-10 w-10" />}
          title="No content available"
          description="Prompt content is not available at this time."
        />
      )}

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <PromptRunsList promptId={prompt.id} />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comments</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentList comments={promptComments} />
        </CardContent>
      </Card>
    </div>
  )
}
