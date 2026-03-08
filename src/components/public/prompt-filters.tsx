'use client'

import { Layers, Tag } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

type CategoryGroup = {
  slug: string
  name: string
  subcategories: { slug: string; name: string }[]
}

type PromptFiltersProps = {
  groups: CategoryGroup[]
  currentLevel?: string
  currentGroup?: string
  currentSub?: string
}

const LEVEL_OPTIONS = [
  { value: 'software-dev-beginner', label: 'Beginner' },
  { value: 'software-dev-experienced', label: 'Experienced' },
  { value: 'vibe-coder', label: 'Vibe Coder' },
]

export function PromptFilters({
  groups,
  currentLevel,
  currentGroup,
  currentSub,
}: PromptFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

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
    router.replace(qs ? `/prompts?${qs}` : '/prompts')
  }

  const categoryValue = currentSub
    ? `${currentGroup}:${currentSub}`
    : currentGroup
      ? currentGroup
      : 'all'

  const categoryLabel = (() => {
    if (!currentGroup) return 'All Categories'
    const group = groups.find((g) => g.slug === currentGroup)
    if (!group) return 'All Categories'
    if (currentSub) {
      const sub = group.subcategories.find((s) => s.slug === currentSub)
      return sub ? `${group.name} / ${sub.name}` : group.name
    }
    return `${group.name} — All`
  })()

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <Select
          value={currentLevel ?? 'all'}
          onValueChange={(val) => navigate({ level: val === 'all' ? undefined : val })}
        >
          <SelectTrigger className="h-9 w-[160px] border-border/60 bg-background/80 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {LEVEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
                <SelectLabel className="text-xs font-semibold uppercase tracking-wider text-[#7da1ff] dark:text-[#93b0ff]">
                  {group.name}
                </SelectLabel>
                <SelectItem value={group.slug}>All {group.name}</SelectItem>
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
