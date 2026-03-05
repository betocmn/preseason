'use client'

import { Filter } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '~/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '~/components/ui/sheet'
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

export function PromptFilters(props: PromptFiltersProps) {
  return (
    <>
      <div className="mb-4 md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              Filters
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-56 p-6 pt-10">
            <FilterNav {...props} />
          </SheetContent>
        </Sheet>
      </div>
      <aside className="hidden w-48 shrink-0 md:block">
        <div className="sticky top-4">
          <FilterNav {...props} />
        </div>
      </aside>
    </>
  )
}

function FilterNav({ groups, currentLevel, currentGroup, currentSub }: PromptFiltersProps) {
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

  return (
    <nav className="space-y-5">
      <FilterSection title="Level">
        <FilterLink active={!currentLevel} onClick={() => navigate({ level: undefined })}>
          All
        </FilterLink>
        {LEVEL_OPTIONS.map((opt) => (
          <FilterLink
            key={opt.value}
            active={currentLevel === opt.value}
            onClick={() => navigate({ level: opt.value })}
          >
            {opt.label}
          </FilterLink>
        ))}
      </FilterSection>

      <FilterSection title="Category">
        <FilterLink
          active={!currentGroup}
          onClick={() => navigate({ group: undefined, sub: undefined })}
        >
          All
        </FilterLink>
        {groups.map((g) => {
          const isActive = currentGroup === g.slug
          return (
            <div key={g.slug}>
              <FilterLink
                active={isActive}
                onClick={() => navigate({ group: g.slug, sub: undefined })}
              >
                {g.name}
              </FilterLink>
              {isActive && g.subcategories.length > 0 && (
                <div className="ml-2 mt-0.5 space-y-0.5 border-l border-border pl-2">
                  <SubFilterLink active={!currentSub} onClick={() => navigate({ sub: undefined })}>
                    All
                  </SubFilterLink>
                  {g.subcategories.map((s) => (
                    <SubFilterLink
                      key={s.slug}
                      active={currentSub === s.slug}
                      onClick={() => navigate({ sub: s.slug })}
                    >
                      {s.name}
                    </SubFilterLink>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </FilterSection>
    </nav>
  )
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function FilterLink({
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
        'block w-full rounded-md px-2 py-1 text-left text-sm transition-colors',
        active
          ? 'bg-accent font-medium text-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function SubFilterLink({
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
        'block w-full rounded-md px-1.5 py-0.5 text-left text-xs transition-colors',
        active
          ? 'font-medium text-foreground'
          : 'text-muted-foreground/70 hover:text-muted-foreground',
      )}
    >
      {children}
    </button>
  )
}
