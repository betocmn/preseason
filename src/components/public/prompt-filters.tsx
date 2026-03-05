'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

type PromptFiltersProps = {
  categories: string[]
  currentLevel?: string
  currentCategory?: string
}

const LEVEL_OPTIONS = [
  { value: 'software-dev-beginner', label: 'Software Dev Beginner' },
  { value: 'software-dev-experienced', label: 'Software Dev Experienced' },
  { value: 'vibe-coder', label: 'Vibe Coder' },
]

export function PromptFilters({ categories, currentLevel, currentCategory }: PromptFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function updateFilter(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    const qs = params.toString()
    router.replace(qs ? `/prompts?${qs}` : '/prompts')
  }

  return (
    <div className="mb-6 flex flex-wrap gap-3">
      <Select
        value={currentLevel ?? 'all'}
        onValueChange={(v) => updateFilter('level', v === 'all' ? undefined : v)}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="All levels" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All levels</SelectItem>
          {LEVEL_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentCategory ?? 'all'}
        onValueChange={(v) => updateFilter('category', v === 'all' ? undefined : v)}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((cat) => (
            <SelectItem key={cat} value={cat.toLowerCase()}>
              {cat}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
