export const revalidate = 3600 // 1 hour

import { TRPCError } from '@trpc/server'
import { ArrowLeft, ExternalLink, MessageSquare } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Card, CardContent } from '~/components/ui/card'
import { Separator } from '~/components/ui/separator'
import { api } from '~/trpc/server'

type Props = {
  params: Promise<{ slug: string }>
}

function formatDate(date: Date | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  try {
    const caller = await api()
    const critic = await caller.critic.getBySlug({ slug })
    const title = `${critic.user.displayName} | Critics`
    const description = critic.title
      ? `${critic.user.displayName} — ${critic.title}. Verified critic on Preseason.`
      : `${critic.user.displayName} is a verified critic on Preseason.`
    const imagePath = `/critics/${encodeURIComponent(slug)}/opengraph-image`
    return {
      title,
      description,
      openGraph: { title, description, type: 'profile', images: [imagePath] },
      twitter: { card: 'summary_large_image', title, description, images: [imagePath] },
    }
  } catch {
    return { title: 'Critic' }
  }
}

export default async function CriticDetailPage({ params }: Props) {
  const { slug } = await params
  const caller = await api()

  const critic = await (async () => {
    try {
      return await caller.critic.getBySlug({ slug })
    } catch (error) {
      if (
        error instanceof TRPCError &&
        (error.code === 'NOT_FOUND' || error.code === 'BAD_REQUEST')
      )
        notFound()
      throw error
    }
  })()

  return (
    <div className="container max-w-3xl py-8">
      <Link
        href="/critics"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All Critics
      </Link>

      <div className="mb-8 mt-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16 ring-2 ring-border">
            {critic.user.avatarUrl && (
              <AvatarImage src={critic.user.avatarUrl} alt={critic.user.displayName} size={64} />
            )}
            <AvatarFallback className="text-lg font-medium">
              {critic.user.displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{critic.user.displayName}</h1>
            {(critic.title || critic.user.company) && (
              <p className="text-muted-foreground">
                {critic.title && <span>{critic.title}</span>}
                {critic.title && critic.user.company && <span> @ </span>}
                {critic.user.company && (
                  <span className="font-semibold">{critic.user.company}</span>
                )}
              </p>
            )}
            {critic.user.website && (
              <Link
                href={critic.user.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                {critic.user.website.replace(/^https?:\/\//, '')}
              </Link>
            )}
            {critic.user.bio && (
              <p className="mt-2 text-sm text-foreground/80">{critic.user.bio}</p>
            )}
            {critic.expertiseAreas && critic.expertiseAreas.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {critic.expertiseAreas.map((area) => (
                  <Badge key={area} variant="secondary" className="text-xs">
                    {area}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Separator className="mb-8" />

      <div>
        <div className="mb-4 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Comments ({critic.commentTargets.length})</h2>
        </div>

        {critic.commentTargets.length > 0 ? (
          <div className="space-y-3">
            {critic.commentTargets.map((ct) => (
              <Card key={ct.id}>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Link href={ct.href}>
                      <Badge variant="secondary" className="text-xs hover:bg-secondary/80">
                        {ct.label}
                      </Badge>
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(ct.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90">{ct.content}</p>
                  <Link
                    href={ct.href}
                    className="mt-2 inline-block text-xs text-[#c4b5fd] hover:underline"
                  >
                    View in context
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No comments yet.</p>
        )}
      </div>
    </div>
  )
}
