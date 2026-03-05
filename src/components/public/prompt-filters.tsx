'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { badgeVariants } from '~/components/ui/badge'
import { cn } from '~/lib/utils'

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

  const activeGroup = groups.find((g) => g.slug === currentGroup)

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Level</span>
        <Pill active={!currentLevel} onClick={() => navigate({ level: undefined })}>
          All
        </Pill>
        {LEVEL_OPTIONS.map((opt) => (
          <Pill
            key={opt.value}
            active={currentLevel === opt.value}
            onClick={() => navigate({ level: opt.value })}
          >
            {opt.label}
          </Pill>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Category</span>
        <Pill active={!currentGroup} onClick={() => navigate({ group: undefined, sub: undefined })}>
          All
        </Pill>
        {groups.map((g) => (
          <Pill
            key={g.slug}
            active={currentGroup === g.slug}
            onClick={() => navigate({ group: g.slug, sub: undefined })}
          >
            {g.name}
          </Pill>
        ))}
      </div>

      {activeGroup && activeGroup.subcategories.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Sub</span>
          <Pill active={!currentSub} onClick={() => navigate({ sub: undefined })}>
            All
          </Pill>
          {activeGroup.subcategories.map((s) => (
            <Pill
              key={s.slug}
              active={currentSub === s.slug}
              onClick={() => navigate({ sub: s.slug })}
            >
              {s.name}
            </Pill>
          ))}
        </div>
      )}
    </div>
  )
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        badgeVariants({ variant: active ? 'default' : 'outline' }),
        'cursor-pointer select-none transition-colors',
        !active && 'hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
}
