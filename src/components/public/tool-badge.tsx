import Link from 'next/link'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { cn } from '~/lib/utils'

type ToolBadgeProps = {
  name: string
  slug: string
  logoUrl?: string | null
  size?: 'sm' | 'md'
  className?: string
}

export function ToolBadge({ name, slug, logoUrl, size = 'md', className }: ToolBadgeProps) {
  const avatarSize = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <Link
      href={`/tools/${slug}`}
      className={cn(
        'inline-flex items-center gap-1.5 font-medium hover:underline',
        textSize,
        className,
      )}
    >
      <Avatar className={cn(avatarSize, 'bg-muted-foreground/15')}>
        {logoUrl && <AvatarImage src={logoUrl} alt={name} />}
        <AvatarFallback className="text-[10px]">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      {name}
    </Link>
  )
}
