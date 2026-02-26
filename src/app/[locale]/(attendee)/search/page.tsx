'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SearchBar } from '~/components/attendee/search-bar'
import { type FilterState, SearchFilters } from '~/components/attendee/search-filters'
import { WineCardList, type WineItem } from '~/components/attendee/wine-card-list'
import { api, type RouterOutputs } from '~/trpc/react'

const PAGE_SIZE = 20

function priceRangeToParams(priceRange?: FilterState['priceRange']) {
  switch (priceRange) {
    case 'under9':
      return { minPrice: undefined, maxPrice: 8.99 }
    case '9to18':
      return { minPrice: 9, maxPrice: 18 }
    case 'over18':
      return { minPrice: 18.01, maxPrice: undefined }
    default:
      return { minPrice: undefined, maxPrice: undefined }
  }
}

type ProducerListItem = RouterOutputs['producer']['list']['items'][number]
type RegionListItem = RouterOutputs['region']['list']['items'][number]
type GrapeVarietyListItem = RouterOutputs['grapeVariety']['list']['items'][number]

export default function SearchPage() {
  const t = useTranslations('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filters, setFilters] = useState<FilterState>({})
  const [offset, setOffset] = useState(0)
  const [accumulatedItems, setAccumulatedItems] = useState<WineItem[]>([])
  const prevQueryKeyRef = useRef('')

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset offset when search/filters change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on query/filter change
  useEffect(() => {
    setOffset(0)
    setAccumulatedItems([])
  }, [debouncedQuery, filters])

  // Build filter params
  const { minPrice, maxPrice } = priceRangeToParams(filters.priceRange)
  const filterParams = useMemo(
    () => ({
      type: filters.type,
      grapeVarietyId: filters.grapeVarietyId,
      regionId: filters.regionId,
      producerId: filters.producerId,
      minPrice,
      maxPrice,
    }),
    [filters, minPrice, maxPrice],
  )

  const hasTextQuery = debouncedQuery.length > 0

  // Fetch data: search when text is present, list otherwise
  const searchResult = api.wine.search.useQuery(
    { query: debouncedQuery, limit: PAGE_SIZE, offset, ...filterParams },
    { enabled: hasTextQuery },
  )

  const listResult = api.wine.list.useQuery(
    { limit: PAGE_SIZE, offset, ...filterParams },
    { enabled: !hasTextQuery },
  )

  const activeResult = hasTextQuery ? searchResult : listResult

  // Accumulate items for load-more
  useEffect(() => {
    if (!activeResult.data) return
    const queryKey = `${hasTextQuery ? 'search' : 'list'}:${JSON.stringify(filterParams)}:${debouncedQuery}`
    if (offset === 0 || queryKey !== prevQueryKeyRef.current) {
      setAccumulatedItems(activeResult.data.items)
      prevQueryKeyRef.current = queryKey
    } else {
      setAccumulatedItems((prev) => [...prev, ...activeResult.data.items])
    }
  }, [activeResult.data, offset, hasTextQuery, filterParams, debouncedQuery])

  const total = activeResult.data?.total ?? 0
  const hasMore = accumulatedItems.length < total

  const handleLoadMore = useCallback(() => {
    setOffset((prev) => prev + PAGE_SIZE)
  }, [])

  const handleFilterChange = useCallback((newFilters: FilterState) => {
    setFilters(newFilters)
  }, [])

  // Fetch filter dropdown data
  const regionsQuery = api.region.list.useQuery()
  const grapeVarietiesQuery = api.grapeVariety.list.useQuery()
  const producersQuery = api.producer.list.useQuery({ limit: 100 })
  const regions: RegionListItem[] = regionsQuery.data?.items ?? []
  const grapeVarieties: GrapeVarietyListItem[] = grapeVarietiesQuery.data?.items ?? []
  const producers: ProducerListItem[] = producersQuery.data?.items ?? []

  return (
    <div className="mx-auto max-w-lg px-4 py-4 lg:max-w-4xl">
      <h1 className="mb-4 text-xl font-bold">{t('title')}</h1>
      <div className="mb-4 space-y-3">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onSubmit={() => setDebouncedQuery(searchQuery)}
        />
        <SearchFilters
          filters={filters}
          onFilterChange={handleFilterChange}
          regions={regions}
          grapeVarieties={grapeVarieties}
          producers={producers}
        />
      </div>
      <WineCardList
        items={accumulatedItems}
        total={total}
        isLoading={activeResult.isLoading}
        isFetchingMore={offset > 0 && activeResult.isFetching}
        hasMore={hasMore}
        onLoadMore={handleLoadMore}
      />
    </div>
  )
}
