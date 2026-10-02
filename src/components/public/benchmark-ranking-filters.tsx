'use client'

import { Bot, CalendarRange, FlaskConical, Layers, Tag } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCanonicalModelRange } from '~/components/public/use-canonical-model-range'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from '~/components/ui/select'
import type { ModelFilterCompany } from '~/lib/model-filters'

type CategoryGroup = {
  slug: string
  name: string
  subcategories: { slug: string; name: string }[]
}

type BenchmarkRankingFiltersProps = {
  groups: CategoryGroup[]
  modelFilters: ModelFilterCompany[]
  currentGroup?: string
  currentSub?: string
  currentPromptLevel?: string
  currentModelTier?: string
  currentModelRangeId?: string
  basePath?: string
  showCategorySelect?: boolean
}

export function BenchmarkRankingFilters({
  groups,
  modelFilters,
  currentGroup,
  currentSub,
  currentPromptLevel,
  currentModelTier,
  currentModelRangeId,
  basePath = '/rankings',
  showCategorySelect = true,
}: BenchmarkRankingFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  useCanonicalModelRange()
  const modelLookup = new Map(
    modelFilters.flatMap((company) => company.ranges.map((range) => [range.id, range])),
  )
  const effectiveGroup = showCategorySelect
    ? (searchParams.get('category') ?? currentGroup)
    : currentGroup
  const effectiveSub = showCategorySelect ? (searchParams.get('sub') ?? currentSub) : currentSub
  const effectivePromptLevel = searchParams.get('promptLevel') ?? currentPromptLevel
  const effectiveModelTier = searchParams.get('modelTier') ?? currentModelTier
  const modelRangeParam = searchParams.get('modelRangeId') ?? currentModelRangeId
  const selectedRangeIds = searchParams.getAll('modelRangeIds')
  const selectedRangesLabel = selectedRangeIds
    .map((id) => modelLookup.get(id)?.label ?? 'Unknown range')
    .join(', ')

  const dateRangeParam = searchParams.get('dateRange')
  const effectiveDateRange =
    (['1m', '3m', '6m'] as const).find((r) => r === dateRangeParam) ?? 'all'

  const normalizedModelRangeId =
    modelRangeParam && modelLookup.has(modelRangeParam) ? modelRangeParam : undefined
  const selectedModel = normalizedModelRangeId ? modelLookup.get(normalizedModelRangeId) : undefined

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
    router.replace(qs ? `${basePath}?${qs}` : basePath)
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
      {showCategorySelect && (
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <Select
            value={categoryValue}
            onValueChange={(val) => {
              if (val === 'all') {
                navigate({ category: undefined, sub: undefined })
              } else if (val.includes(':')) {
                const [groupSlug, subSlug] = val.split(':')
                navigate({ category: groupSlug, sub: subSlug })
              } else {
                navigate({ category: val, sub: undefined })
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
      )}

      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
        <Select
          value={effectivePromptLevel ?? 'all'}
          onValueChange={(val) => {
            navigate({ promptLevel: val === 'all' ? undefined : val })
          }}
        >
          <SelectTrigger className="h-9 w-[220px] border-border/60 bg-background/80 text-sm">
            <span className="truncate">
              {effectivePromptLevel
                ? `${effectivePromptLevel.charAt(0).toUpperCase()}${effectivePromptLevel.slice(1)}`
                : 'All User Prompting Levels'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All User Prompting Levels</SelectItem>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <Select
          value={effectiveModelTier ?? 'all'}
          onValueChange={(val) => {
            navigate({ modelTier: val === 'all' ? undefined : val })
          }}
        >
          <SelectTrigger className="h-9 w-[160px] border-border/60 bg-background/80 text-sm">
            <span className="truncate">
              {effectiveModelTier
                ? `${effectiveModelTier.charAt(0).toUpperCase()}${effectiveModelTier.slice(1)} Models`
                : 'All Model Tiers'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Model Tiers</SelectItem>
            <SelectItem value="frontier">Frontier</SelectItem>
            <SelectItem value="mid">Mid</SelectItem>
            <SelectItem value="small">Small</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <CalendarRange className="h-4 w-4 text-muted-foreground" />
        <Select
          value={effectiveDateRange}
          onValueChange={(val) => {
            navigate({ dateRange: val === 'all' ? undefined : val })
          }}
        >
          <SelectTrigger className="h-9 w-[160px] border-border/60 bg-background/80 text-sm">
            <span className="truncate">
              {effectiveDateRange === '1m'
                ? 'Last Month'
                : effectiveDateRange === '3m'
                  ? 'Last 3 Months'
                  : effectiveDateRange === '6m'
                    ? 'Last 6 Months'
                    : 'All Time'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="1m">Last Month</SelectItem>
            <SelectItem value="3m">Last 3 Months</SelectItem>
            <SelectItem value="6m">Last 6 Months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <Select
          value={selectedRangeIds.length ? 'multiple' : (normalizedModelRangeId ?? 'all')}
          onValueChange={(val) => {
            navigate({
              modelRangeId: val === 'all' ? undefined : val,
              modelSnapshotId: undefined,
              modelRangeIds: undefined,
            })
          }}
        >
          <SelectTrigger className="h-9 w-[260px] border-border/60 bg-background/80 text-sm">
            <span className="truncate" title={selectedRangesLabel || undefined}>
              {selectedRangeIds.length
                ? `${selectedRangeIds.length} selected model ranges`
                : (selectedModel?.label ??
                  (modelRangeParam ? 'Unknown Model Range' : 'All Model Ranges'))}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Model Ranges</SelectItem>
            {selectedRangeIds.length > 0 && (
              <SelectItem value="multiple" disabled>
                {selectedRangeIds.length} selected model ranges
              </SelectItem>
            )}
            {modelFilters.map((company, companyIndex) => (
              <SelectGroup key={company.name}>
                {companyIndex > 0 && <SelectSeparator />}
                <SelectLabel className="text-xs font-semibold uppercase tracking-wider text-[#7da1ff] dark:text-[#93b0ff]">
                  {company.name}
                </SelectLabel>
                {company.ranges.map((range) => (
                  <SelectItem key={range.id} value={range.id}>
                    <span className="pl-2">{range.label}</span>
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
