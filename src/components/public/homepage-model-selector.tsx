'use client'

import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import Image from 'next/image'
import { useId, useState } from 'react'
import { Checkbox } from '~/components/ui/checkbox'
import type { ModelFilterCompany } from '~/lib/model-filters'
import { cn } from '~/lib/utils'

const featuredProviders = [
  { company: 'Anthropic', label: 'Anthropic', family: 'Claude', logo: 'anthropic' },
  { company: 'OpenAI', label: 'OpenAI', family: 'GPT', logo: 'openai' },
  { company: 'DeepSeek', label: 'DeepSeek', family: 'DeepSeek', logo: 'deepseek' },
  { company: 'Google', label: 'Gemini', family: 'Google', logo: 'gemini' },
  { company: 'MoonshotAI', label: 'Kimi', family: 'Moonshot AI', logo: 'kimi' },
]

type HomepageModelSelectorProps = {
  companies: ModelFilterCompany[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function HomepageModelSelector({
  companies,
  selectedIds,
  onChange,
}: HomepageModelSelectorProps) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const selected = new Set(selectedIds)
  const allIds = companies.flatMap((company) => company.ranges.map((range) => range.id))
  const featured = featuredProviders.flatMap((provider) => {
    const company = companies.find((entry) => entry.name === provider.company)
    return company ? [{ ...provider, ...company }] : []
  })
  const otherCompanies = companies.filter(
    (company) => !featuredProviders.some((provider) => provider.company === company.name),
  )
  const otherSelected = otherCompanies
    .flatMap((company) => company.ranges)
    .filter((range) => selected.has(range.id)).length

  function toggle(ids: string[], checked: boolean) {
    const next = new Set(selectedIds)
    for (const id of ids) {
      if (checked) next.add(id)
      else next.delete(id)
    }
    onChange([...next].sort())
  }

  function selectionState(ids: string[]) {
    const count = ids.filter((id) => selected.has(id)).length
    return count === ids.length ? true : count > 0 ? ('indeterminate' as const) : false
  }

  return (
    <section
      aria-labelledby={`${panelId}-heading`}
      className="rounded-xl border bg-card p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${panelId}-heading`} className="text-sm font-medium">
          Ranked by recommendations from
        </h2>
        <button
          type="button"
          onClick={() => onChange(selectedIds.length === allIds.length ? [] : allIds)}
          className="rounded text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {selectedIds.length === allIds.length ? 'Clear selection' : 'Select all models'}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {featured.map((provider) => {
          const ids = provider.ranges.map((range) => range.id)
          const checked = selectionState(ids)
          return (
            <label
              key={provider.company}
              htmlFor={`${panelId}-${provider.logo}`}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2.5 transition-colors sm:gap-3 sm:px-3 sm:py-3 hover:bg-accent/70',
                checked ? 'border-primary/30 bg-primary/5' : 'border-border bg-background',
              )}
            >
              <Image
                src={`/model-providers/${provider.logo}.svg`}
                alt=""
                width={24}
                height={24}
                className={cn(
                  'size-5 shrink-0 sm:size-6',
                  provider.logo === 'kimi' && 'rounded bg-[#111318] p-0.5',
                )}
                unoptimized
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium sm:text-sm">{provider.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {provider.family}
                </span>
              </span>
              <Checkbox
                id={`${panelId}-${provider.logo}`}
                checked={checked}
                onCheckedChange={(value) => toggle(ids, value === true)}
                aria-label={`${provider.label} model ranges`}
              />
            </label>
          )
        })}
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((value) => !value)}
          className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SlidersHorizontal
            className="hidden size-4 shrink-0 text-muted-foreground lg:block"
            aria-hidden="true"
          />
          <span className="flex-1 whitespace-nowrap text-[13px] font-medium sm:text-sm">
            More models
            <span className="block text-[11px] font-normal text-muted-foreground">
              {otherSelected} more selected
            </span>
          </span>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </button>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        {selectedIds.length} of {allIds.length} model ranges selected. Versions are grouped by
        family.
      </p>
      {expanded && (
        <div id={panelId} className="mt-5 border-t pt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Choose individual model ranges</h3>
            <p className="text-xs text-muted-foreground">
              Version labels show the releases measured so far.
            </p>
          </div>
          <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            {companies.map((company) => (
              <fieldset key={company.name} className="min-w-0">
                <legend className="mb-2 text-xs font-semibold text-muted-foreground">
                  {company.name}
                </legend>
                <div className="space-y-1">
                  {company.ranges.map((range) => (
                    <label
                      key={range.id}
                      htmlFor={`${panelId}-${encodeURIComponent(range.id)}`}
                      className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded px-1 text-xs hover:bg-accent"
                    >
                      <Checkbox
                        id={`${panelId}-${encodeURIComponent(range.id)}`}
                        checked={selected.has(range.id)}
                        onCheckedChange={(checked) => toggle([range.id], checked === true)}
                      />
                      <span>{range.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
