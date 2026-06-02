'use client'

import { ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { ScrollArea } from '~/components/ui/scroll-area'
import { cn } from '~/lib/utils'

type Subcategory = {
  id: string
  name: string
  slug: string
}

type CategoryGroup = {
  id: string
  name: string
  slug: string
  subcategories: Subcategory[]
}

type CategoryTreeSidebarProps = {
  groups: CategoryGroup[]
  section: 'rankings' | 'matches' | 'critics'
  className?: string
}

const DEFAULT_GROUP_SLUG = 'devtools'

export function CategoryTreeSidebar({ groups, section, className }: CategoryTreeSidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const activeGroupSlug = deriveActiveGroup(groups, section, pathname, searchParams)
  const activeSubSlug = deriveActiveSubcategory(section, pathname, searchParams)

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(activeGroupSlug ? [activeGroupSlug] : []),
  )

  const toggleGroup = (slug: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  return (
    <ScrollArea className={cn('h-[calc(100vh-5rem)]', className)}>
      <nav className="space-y-0.5 py-2 pr-3">
        {groups.map((group) => {
          const isExpanded = expandedGroups.has(group.slug)
          const isActiveGroup = activeGroupSlug === group.slug

          const groupHref = buildGroupHref(section, group.slug)

          return (
            <div key={group.id}>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.slug)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                <Link
                  href={groupHref}
                  onClick={() => {
                    if (!expandedGroups.has(group.slug)) {
                      setExpandedGroups((prev) => new Set(prev).add(group.slug))
                    }
                  }}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
                    isActiveGroup ? 'font-medium text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {group.name}
                </Link>
              </div>

              {isExpanded && group.subcategories.length > 0 && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
                  <Link
                    href={groupHref}
                    className={cn(
                      'block rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent',
                      isActiveGroup && !activeSubSlug
                        ? 'bg-accent font-medium text-foreground'
                        : 'text-muted-foreground',
                    )}
                  >
                    All
                  </Link>
                  {group.subcategories.map((sub) => {
                    const subHref = buildSubcategoryHref(section, group.slug, sub.slug)
                    const isActiveSub = isActiveGroup && activeSubSlug === sub.slug

                    return (
                      <Link
                        key={sub.id}
                        href={subHref}
                        className={cn(
                          'block rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent',
                          isActiveSub
                            ? 'bg-accent font-medium text-foreground'
                            : 'text-muted-foreground',
                        )}
                      >
                        {sub.name}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </ScrollArea>
  )
}

function deriveActiveGroup(
  groups: CategoryGroup[],
  section: string,
  pathname: string,
  searchParams: URLSearchParams,
): string {
  if (section === 'rankings') {
    const match = pathname.match(/^\/rankings\/([^/]+)/)
    if (match?.[1]) return match[1]
    return DEFAULT_GROUP_SLUG
  }

  const categoryParam = searchParams.get('category')
  if (categoryParam && groups.some((g) => g.slug === categoryParam)) {
    return categoryParam
  }

  return DEFAULT_GROUP_SLUG
}

function deriveActiveSubcategory(
  section: string,
  pathname: string,
  searchParams: URLSearchParams,
): string | undefined {
  if (section === 'rankings') {
    const match = pathname.match(/^\/rankings\/[^/]+\/([^/]+)/)
    return match?.[1]
  }

  return searchParams.get('sub') ?? undefined
}

function buildGroupHref(section: string, groupSlug: string): string {
  if (section === 'rankings') return `/rankings/${groupSlug}`
  return `/${section}?category=${groupSlug}`
}

function buildSubcategoryHref(section: string, groupSlug: string, subSlug: string): string {
  if (section === 'rankings') return `/rankings/${groupSlug}/${subSlug}`
  return `/${section}?category=${groupSlug}&sub=${subSlug}`
}
