import { MessageSquare } from 'lucide-react'
import { EmptyState } from '~/components/public/empty-state'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Separator } from '~/components/ui/separator'

type Comment = {
  id: string
  content: string
  isPinned: boolean
  createdAt: Date | null
  critic: {
    id: string
    title: string | null
    user: {
      displayName: string
      avatarUrl: string | null
    }
  }
}

type CommentListProps = {
  comments: Comment[]
}

function formatDate(date: Date | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function CommentList({ comments }: CommentListProps) {
  if (comments.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare className="h-10 w-10" />}
        title="No comments yet"
        description="Verified critics can leave comments here."
      />
    )
  }

  return (
    <div className="space-y-0">
      {comments.map((comment, index) => (
        <div key={comment.id}>
          {index > 0 && <Separator />}
          <div className="py-4">
            <div className="mb-2 flex items-center gap-2">
              <Avatar className="h-7 w-7">
                {comment.critic.user.avatarUrl && (
                  <AvatarImage
                    src={comment.critic.user.avatarUrl}
                    alt={comment.critic.user.displayName}
                    size={28}
                  />
                )}
                <AvatarFallback className="text-[10px]">
                  {comment.critic.user.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{comment.critic.user.displayName}</span>
                {comment.critic.title && (
                  <span className="text-xs text-muted-foreground">{comment.critic.title}</span>
                )}
              </div>
              <span className="ml-auto text-xs text-muted-foreground">
                {formatDate(comment.createdAt)}
              </span>
            </div>
            <p className="text-sm text-foreground/90">{comment.content}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
