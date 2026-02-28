import Link from 'next/link'
import { badgeVariants } from '~/components/ui/badge'
import { cn } from '~/lib/utils'

type CategoryPillProps = {
  name: string
  slug: string
  active?: boolean
  className?: string
}

export function CategoryPill({ name, slug, active, className }: CategoryPillProps) {
  return (
    <Link
      href={`/rankings/${slug}`}
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
