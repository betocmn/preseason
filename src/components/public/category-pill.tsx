import Link from 'next/link'
import { badgeVariants } from '~/components/ui/badge'
import { cn } from '~/lib/utils'

type CategoryPillProps = {
  name: string
  slug: string
  groupSlug?: string
  active?: boolean
  className?: string
}

export function CategoryPill({ name, slug, groupSlug, active, className }: CategoryPillProps) {
  const href = groupSlug ? `/rankings/${groupSlug}/${slug}` : '/rankings'

  return (
    <Link
      href={href}
      className={cn(
        badgeVariants({ variant: active ? 'default' : 'secondary' }),
        'cursor-pointer hover:bg-accent',
        className,
      )}
    >
      {name}
    </Link>
  )
}
