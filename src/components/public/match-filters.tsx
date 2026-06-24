'use client'

import { Tag } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from '~/components/ui/select'

type CategoryGroup = {
  slug: string
  name: string
  subcategories: { slug: string; name: string }[]
}

type MatchFiltersProps = {
  groups: CategoryGroup[]
  currentGroup?: string
  currentSub?: string
}

export function MatchFilters({ groups, currentGroup, currentSub }: MatchFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const effectiveGroup = searchParams.get('group') ?? currentGroup
  const effectiveSub = searchParams.get('sub') ?? currentSub

  function navigate(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }
    const qs = params.toString()
    router.replace(qs ? `/matches?${qs}` : '/matches')
  }

  const categoryValue = effectiveSub
    ? `${effectiveGroup}:${effectiveSub}`
    : effectiveGroup
      ? effectiveGroup
      : 'all'

  const categoryLabel = (() => {
    if (!effectiveGroup) return 'All Categories'
    const group = groups.find((g) => g.slug === effectiveGroup)
    if (!group) return 'All Categories'
    if (effectiveSub) {
      const sub = group.subcategories.find((s) => s.slug === effectiveSub)
      return sub ? `${group.name} / ${sub.name}` : group.name
    }
    return `All ${group.name}`
  })()

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-muted-foreground" />
        <Select
          value={categoryValue}
          onValueChange={(val) => {
            if (val === 'all') {
              navigate({ group: undefined, sub: undefined })
            } else if (val.includes(':')) {
              const [groupSlug, subSlug] = val.split(':')
              navigate({ group: groupSlug, sub: subSlug })
            } else {
              navigate({ group: val, sub: undefined })
            }
          }}
        >
          <SelectTrigger className="h-9 w-[220px] border-border/60 bg-background/80 text-sm">
            <span className="truncate">{categoryLabel}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {groups.map((group, i) => (
              <SelectGroup key={group.slug}>
                {i > 0 && <SelectSeparator />}
                <SelectItem
                  value={group.slug}
                  className="text-xs font-semibold tracking-wider text-[#7da1ff] dark:text-[#93b0ff]"
                >
                  All {group.name}
                </SelectItem>
                {group.subcategories.map((sub) => (
                  <SelectItem key={sub.slug} value={`${group.slug}:${sub.slug}`}>
                    <span className="pl-2">{sub.name}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
