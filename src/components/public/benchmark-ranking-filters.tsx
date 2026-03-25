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
  currentGroup?: string
  currentSub?: string
  currentPromptLevel?: string
  currentModelTier?: string
  currentModelCompany?: string
  currentModelFamily?: string
  currentModelSnapshotId?: string
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
  currentModelCompany,
  currentModelFamily,
  currentModelSnapshotId,
  basePath = '/rankings',
  showCategorySelect = true,
}: BenchmarkRankingFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const companyLookup = new Map(modelFilters.map((company) => [company.name, company]))
  const normalizedCompany =
    currentModelCompany && companyLookup.has(currentModelCompany) ? currentModelCompany : undefined
  const selectedCompany = normalizedCompany ? companyLookup.get(normalizedCompany) : undefined

  const allFamilies = Array.from(
    new Set(modelFilters.flatMap((company) => company.families.map((family) => family.name))),
  ).sort((a, b) => a.localeCompare(b))
  const availableFamilies = selectedCompany
    ? selectedCompany.families.map((family) => family.name)
    : allFamilies
  const normalizedFamily =
    currentModelFamily && availableFamilies.includes(currentModelFamily)
      ? currentModelFamily
      : undefined

  const availableModels = (selectedCompany ? [selectedCompany] : modelFilters).flatMap((company) =>
    company.families
      .filter((family) => !normalizedFamily || family.name === normalizedFamily)
      .flatMap((family) =>
        family.models.map((model) => ({
          ...model,
          company: company.name,
          family: family.name,
        })),
      ),
  )

  const modelLookup = new Map(
    modelFilters.flatMap((company) =>
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
  const availableModelIds = new Set(availableModels.map((model) => model.id))
  const normalizedModelSnapshotId =
    currentModelSnapshotId && availableModelIds.has(currentModelSnapshotId)
      ? currentModelSnapshotId
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
      )}

      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
        <Select
          value={currentPromptLevel ?? 'all'}
          onValueChange={(val) => {
            navigate({ promptLevel: val === 'all' ? undefined : val })
          }}
        >
          <SelectTrigger className="h-9 w-[160px] border-border/60 bg-background/80 text-sm">
            <span className="truncate">
              {currentPromptLevel
                ? `${currentPromptLevel.charAt(0).toUpperCase()}${currentPromptLevel.slice(1)}`
                : 'All Levels'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <Select
          value={currentModelTier ?? 'all'}
          onValueChange={(val) => {
            navigate({ modelTier: val === 'all' ? undefined : val })
          }}
        >
          <SelectTrigger className="h-9 w-[160px] border-border/60 bg-background/80 text-sm">
            <span className="truncate">
              {currentModelTier
                ? `${currentModelTier.charAt(0).toUpperCase()}${currentModelTier.slice(1)} Models`
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
          value={normalizedCompany ?? 'all'}
          onValueChange={(val) => {
            if (val === 'all') {
              navigate({
                modelCompany: undefined,
                modelFamily: undefined,
                modelSnapshotId: undefined,
              })
              return
            }

            navigate({
              modelCompany: val,
              modelFamily: undefined,
              modelSnapshotId: undefined,
            })
          }}
        >
          <SelectTrigger className="h-9 w-[170px] border-border/60 bg-background/80 text-sm">
            <span className="truncate">{normalizedCompany ?? 'All Companies'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {modelFilters.map((company) => (
              <SelectItem key={company.name} value={company.name}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <Select
          value={normalizedFamily ?? 'all'}
          onValueChange={(val) => {
            if (val === 'all') {
              navigate({
                modelFamily: undefined,
                modelSnapshotId: undefined,
              })
              return
            }

            navigate({
              modelFamily: val,
              modelSnapshotId: undefined,
            })
          }}
        >
          <SelectTrigger className="h-9 w-[170px] border-border/60 bg-background/80 text-sm">
            <span className="truncate">{normalizedFamily ?? 'All Families'}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Families</SelectItem>
            {availableFamilies.map((family) => (
              <SelectItem key={family} value={family}>
                {family}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <Select
          value={normalizedModelSnapshotId ?? 'all'}
          onValueChange={(val) => {
            if (val === 'all') {
              navigate({ modelSnapshotId: undefined })
              return
            }

            const model = modelLookup.get(val)
            if (!model) return
            navigate({
              modelCompany: model.company,
              modelFamily: model.family,
              modelSnapshotId: model.id,
            })
          }}
        >
          <SelectTrigger className="h-9 w-[260px] border-border/60 bg-background/80 text-sm">
            <span className="truncate">
              {normalizedModelSnapshotId
                ? (availableModels.find((model) => model.id === normalizedModelSnapshotId)?.name ??
                  'All Models')
                : 'All Models'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Models</SelectItem>
            {(selectedCompany ? [selectedCompany] : modelFilters).map((company, companyIndex) => (
              <SelectGroup key={company.name}>
                {companyIndex > 0 && <SelectSeparator />}
                <SelectLabel className="text-xs font-semibold uppercase tracking-wider text-[#7da1ff] dark:text-[#93b0ff]">
                  {company.name}
                </SelectLabel>
                {company.families
                  .filter((family) => !normalizedFamily || family.name === normalizedFamily)
                  .map((family) => (
                    <SelectGroup key={`${company.name}:${family.name}`}>
                      <SelectLabel className="pl-10 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {family.name}
                      </SelectLabel>
                      {family.models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <span className="pl-4">{model.name}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
