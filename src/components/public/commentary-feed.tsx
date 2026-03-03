import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'

type CommentContext = {
  type: 'match' | 'tool' | 'recommendation'
  label: string
  sublabel: string
  href: string
  logos: Array<{ url: string | null; name: string }>
}

type CommentItem = {
  id: string
  content: string
  createdAt: Date | null
  critic: {
    id: string
    user: {
      displayName: string
      avatarUrl: string | null
      company: string | null
    }
    title: string | null
  }
  context: CommentContext
}

function formatDate(date: Date | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) return text
  const truncated = text.slice(0, maxLength)
  const lastSpace = truncated.lastIndexOf(' ')
  return `${(lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trimEnd()}...`
}

function ToolLogo({ url, name, size = 5 }: { url: string | null; name: string; size?: number }) {
  return (
    <Avatar className={`h-${size} w-${size} ring-1 ring-border`}>
      {url && <AvatarImage src={url} alt={name} />}
      <AvatarFallback className="bg-secondary text-[8px]">
        {name.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  )
}

export function CommentaryFeed({ comments }: { comments: CommentItem[] }) {
  return (
    <div className="space-y-4">
      {comments.map((comment) => {
        const [logoA, logoB] = comment.context.logos

        return (
          <div
            key={comment.id}
            className="group relative overflow-hidden rounded-lg border border-border bg-secondary/20 transition-colors hover:bg-secondary/60"
          >
            <div className="relative z-0 flex flex-col gap-4 p-5">
              {/* Critic header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    href={`/critics/${comment.critic.id}`}
                    className="relative z-20 flex items-center gap-2 hover:underline"
                  >
                    <Avatar className="h-7 w-7">
                      {comment.critic.user.avatarUrl && (
                        <AvatarImage
                          src={comment.critic.user.avatarUrl}
                          alt={comment.critic.user.displayName}
                        />
                      )}
                      <AvatarFallback className="text-[10px]">
                        {comment.critic.user.displayName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-semibold">{comment.critic.user.displayName}</span>
                  </Link>
                  {comment.critic.title && (
                    <span className="text-xs text-muted-foreground">· {comment.critic.title}</span>
                  )}
                  {comment.critic.user.company && (
                    <span className="text-xs text-muted-foreground">
                      @ <span className="font-semibold">{comment.critic.user.company}</span>
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(comment.createdAt)}
                </span>
              </div>

              {/* Comment text */}
              <p className="text-sm leading-relaxed text-foreground/75">
                &ldquo;{truncate(comment.content, 220)}&rdquo;
              </p>

              {/* Match context */}
              <div className="flex items-center gap-2 border-t border-border/40 pt-2">
                <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {logoA && logoB ? (
                    <>
                      <ToolLogo url={logoA.url} name={logoA.name} size={4} />
                      <span className="truncate">{logoA.name}</span>
                      <span className="text-muted-foreground/60">vs</span>
                      <ToolLogo url={logoB.url} name={logoB.name} size={4} />
                      <span className="truncate">{logoB.name}</span>
                    </>
                  ) : logoA ? (
                    <>
                      <ToolLogo url={logoA.url} name={logoA.name} size={4} />
                      <span className="truncate">{comment.context.label}</span>
                    </>
                  ) : (
                    <span className="truncate">{comment.context.label}</span>
                  )}
                  {comment.context.sublabel && (
                    <Badge
                      variant="secondary"
                      className="shrink-0 px-1.5 py-0 text-[10px] font-normal"
                    >
                      {comment.context.sublabel}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <Link
              href={comment.context.href}
              className="absolute inset-0 z-10"
              aria-label={comment.context.label}
            />
          </div>
        )
      })}
    </div>
  )
}
