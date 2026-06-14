export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

import { TRPCError } from '@trpc/server'
import { CheckCircle, ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CategoryPill } from '~/components/public/category-pill'
import { CommentList } from '~/components/public/comment-list'
import { ToolMatchupList } from '~/components/public/tool-matchup-list'
import { ToolRankingSummary } from '~/components/public/tool-ranking-summary'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { getToolBenchmarkPageData } from '~/server/api/helpers/tool-page-data'
import { db } from '~/server/db'
import { publicApi } from '~/trpc/server'

type Props = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const caller = await publicApi()
    const tool = await caller.tool.getBySlug({ slug })
    const title = tool.name
    const description = tool.description ?? `See how LLMs recommend ${tool.name}.`
    const imagePath = `/tools/${encodeURIComponent(slug)}/opengraph-image`
    return {
      title,
      description,
      openGraph: { title, description, type: 'article', images: [imagePath] },
      twitter: { card: 'summary_large_image', title, description, images: [imagePath] },
    }
  } catch {
    return { title: 'Tool' }
  }
}

export default async function ToolDetailPage({ params }: Props) {
  const { slug } = await params
  const caller = await publicApi()

  const tool = await (async () => {
    try {
      return await caller.tool.getBySlug({ slug })
    } catch (error) {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound()
      throw error
    }
  })()

  const [comments, benchmarkData] = await Promise.all([
    caller.comment.listByTarget({ targetType: 'tool', targetId: tool.id }),
    getToolBenchmarkPageData(db, tool),
  ])

  const toolCategories = tool.toolCategories?.map((tc) => tc.category) ?? []

  return (
    <div className="container max-w-4xl py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Avatar className="h-8 w-8 bg-muted-foreground/25 ring-2 ring-muted-foreground/40">
            {tool.logoUrl && <AvatarImage src={tool.logoUrl} alt={tool.name} size={32} />}
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

      {/* Rankings */}
      <ToolRankingSummary rankings={benchmarkData.rankings} />

      {/* Matchups */}
      <ToolMatchupList matchups={benchmarkData.matchups} />

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
