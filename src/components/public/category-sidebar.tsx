import Link from 'next/link'
import { cn } from '~/lib/utils'

type Category = {
  id: string
  name: string
  slug: string
  icon: string | null
}

type CategorySidebarProps = {
  categories: Category[]
  activeSlug?: string
  basePath: string
  className?: string
}

export function CategorySidebar({ categories, activeSlug, basePath, className }: CategorySidebarProps) {
  return (
    <nav className={cn('space-y-0.5', className)}>
      <Link
        href={basePath}
        className={cn(
          'block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
          !activeSlug && 'bg-accent font-medium',
        )}
      >
        All
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`${basePath}/${category.slug}`}
          className={cn(
            'block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
            activeSlug === category.slug && 'bg-accent font-medium',
          )}
        >
          {category.name}
        </Link>
      ))}
    </nav>
  )
}
