'use client'

import { Bot, FlaskConical, Layers, Tag } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
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
  archivedModelFilters?: ModelFilterCompany[]
  currentGroup?: string
  currentSub?: string
  currentPromptLevel?: string
  currentModelTier?: string
  currentModelSnapshotId?: string
  basePath?: string
  showCategorySelect?: boolean
}

export function BenchmarkRankingFilters({
  groups,
  modelFilters,
  archivedModelFilters = [],
  currentGroup,
  currentSub,
  currentPromptLevel,
  currentModelTier,
  currentModelSnapshotId,
  basePath = '/rankings',
  showCategorySelect = true,
}: BenchmarkRankingFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const modelLookup = new Map(
    [...modelFilters, ...archivedModelFilters].flatMap((company) =>
      company.families.flatMap((family) =>
        family.models.map((model) => [
          model.id,
          {
            ...model,
            company: company.name,
            family: family.name,
          },
        ]),
      ),
    ),
  )
  const effectiveGroup = showCategorySelect
    ? (searchParams.get('category') ?? currentGroup)
    : currentGroup
  const effectiveSub = showCategorySelect ? (searchParams.get('sub') ?? currentSub) : currentSub
  const effectivePromptLevel = searchParams.get('promptLevel') ?? currentPromptLevel
  const effectiveModelTier = searchParams.get('modelTier') ?? currentModelTier
  const modelSnapshotParam = searchParams.get('modelSnapshotId') ?? currentModelSnapshotId

  const normalizedModelSnapshotId =
    modelSnapshotParam && modelLookup.has(modelSnapshotParam) ? modelSnapshotParam : undefined
  const selectedModel = normalizedModelSnapshotId
    ? modelLookup.get(normalizedModelSnapshotId)
    : undefined

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
        <Bot className="h-4 w-4 text-muted-foreground" />
        <Select
          value={normalizedModelSnapshotId ?? 'all'}
          onValueChange={(val) => {
            navigate({ modelSnapshotId: val === 'all' ? undefined : val })
          }}
        >
          <SelectTrigger className="h-9 w-[260px] border-border/60 bg-background/80 text-sm">
            <span className="truncate">
              {selectedModel
                ? `${selectedModel.family} - ${selectedModel.version}`
                : 'All Model Versions'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Model Versions</SelectItem>
            {modelFilters.map((company, companyIndex) => (
              <SelectGroup key={company.name}>
                {companyIndex > 0 && <SelectSeparator />}
                <SelectLabel className="text-xs font-semibold uppercase tracking-wider text-[#7da1ff] dark:text-[#93b0ff]">
                  {company.name}
                </SelectLabel>
                {company.families.flatMap((family) =>
                  family.models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <span className="pl-2">{`${family.name} - ${model.version}`}</span>
                    </SelectItem>
                  )),
                )}
              </SelectGroup>
            ))}
            {archivedModelFilters.length > 0 && (
              <SelectGroup>
                <SelectSeparator />
                <SelectLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Archived
                </SelectLabel>
                {archivedModelFilters.flatMap((company) =>
                  company.families.flatMap((family) =>
                    family.models.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <span className="pl-2">{`${company.name} · ${family.name} - ${model.version}`}</span>
                      </SelectItem>
                    )),
                  ),
                )}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
