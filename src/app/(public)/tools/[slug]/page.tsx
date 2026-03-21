import { TRPCError } from '@trpc/server'
import { CheckCircle, ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CategoryPill } from '~/components/public/category-pill'
import { CommentList } from '~/components/public/comment-list'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { api } from '~/trpc/server'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const caller = await api()
    const tool = await caller.tool.getBySlug({ slug })
    const title = tool.name
    const description = tool.description ?? `See how LLMs recommend ${tool.name}.`
    return {
      title,
      description,
      openGraph: { title, description, type: 'article' },
      twitter: { card: 'summary_large_image', title, description },
    }
  } catch {
    return { title: 'Tool' }
  }
}

export default async function ToolDetailPage({ params }: Props) {
  const { slug } = await params
  const caller = await api()

  const tool = await (async () => {
    try {
      return await caller.tool.getBySlug({ slug })
    } catch (error) {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
      throw error
    }
  })()

  const comments = await caller.comment.listByTarget({ targetType: 'tool', targetId: tool.id })

  const toolCategories = tool.toolCategories?.map((tc) => tc.category) ?? []

  return (
    <div className="container max-w-4xl py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Avatar className="h-8 w-8 bg-muted">
            {tool.logoUrl && <AvatarImage src={tool.logoUrl} alt={tool.name} className="p-0.5" />}
            <AvatarFallback className="text-xs">
              {tool.name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <h1 className="text-2xl font-bold">{tool.name}</h1>
          {tool.isVerified && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <CheckCircle className="h-3 w-3" />
              Verified
            </Badge>
          )}
        </div>

        {tool.description && <p className="mb-3 text-muted-foreground">{tool.description}</p>}

        <div className="mb-3 flex flex-wrap gap-2">
          {toolCategories.map((cat) => (
            <CategoryPill
              key={cat.id}
              name={cat.name}
              slug={cat.slug}
              groupSlug={cat.categoryGroup?.slug}
            />
          ))}
        </div>

        {tool.website && (
          <Button variant="outline" size="sm" asChild>
            <Link href={tool.website} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3 w-3" />
              Website
            </Link>
          </Button>
        )}
      </div>

      {/* Comments */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comments</CardTitle>
        </CardHeader>
        <CardContent>
          <CommentList comments={comments} />
        </CardContent>
      </Card>
    </div>
  )
}
