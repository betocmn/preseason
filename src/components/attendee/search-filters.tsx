'use client'

import { SlidersHorizontal, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet'

const wineTypeValues = ['red', 'white', 'rose', 'orange', 'sparkling', 'dessert'] as const

const priceRangeValues = ['under9', '9to18', 'over18'] as const

export type FilterState = {
  type?: (typeof wineTypeValues)[number]
  priceRange?: (typeof priceRangeValues)[number]
  grapeVarietyId?: string
  regionId?: string
  producerId?: string
}

type SearchFiltersProps = {
  filters: FilterState
  onFilterChange: (filters: FilterState) => void
  regions: Array<{ id: string; name: string }>
  grapeVarieties: Array<{ id: string; name: string }>
  producers: Array<{ id: string; name: string }>
}

function FilterSelects({
  filters,
  onFilterChange,
  regions,
  grapeVarieties,
  producers,
}: SearchFiltersProps) {
  const t = useTranslations('search')
  const normalizeFilterValue = (value: string) => (value === 'all' ? undefined : value)

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
      <Select
        value={filters.type ?? 'all'}
        onValueChange={(value) =>
          onFilterChange({
            ...filters,
            type: normalizeFilterValue(value) as FilterState['type'],
          })
        }
      >
        <SelectTrigger className="w-full lg:w-[150px]">
          <SelectValue placeholder={t('filters.wineType')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allTypes')}</SelectItem>
          {wineTypeValues.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`wineTypes.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.priceRange ?? 'all'}
        onValueChange={(value) =>
          onFilterChange({
            ...filters,
            priceRange: normalizeFilterValue(value) as FilterState['priceRange'],
          })
        }
      >
        <SelectTrigger className="w-full lg:w-[160px]">
          <SelectValue placeholder={t('filters.priceRange')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allPrices')}</SelectItem>
          {priceRangeValues.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`priceRanges.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.grapeVarietyId ?? 'all'}
        onValueChange={(value) =>
          onFilterChange({
            ...filters,
            grapeVarietyId: normalizeFilterValue(value),
          })
        }
      >
        <SelectTrigger className="w-full lg:w-[180px]">
          <SelectValue placeholder={t('filters.grapeVariety')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allGrapes')}</SelectItem>
          {grapeVarieties.map((gv) => (
            <SelectItem key={gv.id} value={gv.id}>
              {gv.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.regionId ?? 'all'}
        onValueChange={(value) =>
          onFilterChange({
            ...filters,
            regionId: normalizeFilterValue(value),
          })
        }
      >
        <SelectTrigger className="w-full lg:w-[170px]">
          <SelectValue placeholder={t('filters.region')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allRegions')}</SelectItem>
          {regions.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.producerId ?? 'all'}
        onValueChange={(value) =>
          onFilterChange({
            ...filters,
            producerId: normalizeFilterValue(value),
          })
        }
      >
        <SelectTrigger className="w-full lg:w-[170px]">
          <SelectValue placeholder={t('filters.producer')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allProducers')}</SelectItem>
          {producers.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function SearchFilters(props: SearchFiltersProps) {
  const t = useTranslations('search')
  const { filters, onFilterChange } = props
  const [open, setOpen] = useState(false)

  const activeCount = Object.values(filters).filter(Boolean).length

  const clearFilters = () => {
    onFilterChange({})
  }

  return (
    <>
      {/* Mobile: Sheet trigger */}
      <div className="flex items-center gap-2 lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <SlidersHorizontal className="h-4 w-4" />
              {t('filters.title')}
              {activeCount > 0 && (
                <Badge
                  variant="default"
                  className="ml-1 h-5 w-5 justify-center rounded-full p-0 text-[10px]"
                >
                  {activeCount}
                </Badge>
              )}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[80vh]">
            <SheetHeader>
              <SheetTitle>{t('filters.title')}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <FilterSelects {...props} />
              <div className="flex gap-2">
                {activeCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                    <X className="h-3 w-3" />
                    {t('filters.clearFilters')}
                  </Button>
                )}
                <SheetClose asChild>
                  <Button size="sm" className="ml-auto">
                    {t('filters.apply')}
                  </Button>
                </SheetClose>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="gap-1 text-xs text-muted-foreground"
          >
            <X className="h-3 w-3" />
            {t('filters.clear')}
          </Button>
        )}
      </div>

      {/* Desktop: Inline filters */}
      <div className="hidden lg:block">
        <div className="flex items-center gap-2">
          <FilterSelects {...props} />
          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 shrink-0">
              <X className="h-3 w-3" />
              {t('filters.clear')}
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
