import Link from 'next/link'
import { Badge } from '~/components/ui/badge'
import { cn } from '~/lib/utils'

type CategoryPillProps = {
  name: string
  slug: string
  active?: boolean
  className?: string
}

export function CategoryPill({ name, slug, active, className }: CategoryPillProps) {
  return (
    <Badge
      asChild
      variant={active ? 'default' : 'secondary'}
      className={cn('cursor-pointer hover:bg-accent', className)}
    >
      <Link href={`/rankings/${slug}`}>{name}</Link>
    </Badge>
  )
}
