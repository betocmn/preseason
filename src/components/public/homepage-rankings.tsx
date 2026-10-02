'use client'

import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { EmptyState } from '~/components/public/empty-state'
import { HomepageModelSelector } from '~/components/public/homepage-model-selector'
import {
  type HomepageRankingPreview,
  HomepageRankingsPreview,
} from '~/components/public/homepage-rankings-preview'
import { Button } from '~/components/ui/button'
import type { ModelFilterCompany } from '~/lib/model-filters'
import { api } from '~/trpc/react'

type HomepageRankingsProps = {
  initialPreviews: HomepageRankingPreview[]
  companies: ModelFilterCompany[]
  anchorDate: string
}

export function HomepageRankings({
  initialPreviews,
  companies,
  anchorDate,
}: HomepageRankingsProps) {
  const allIds = companies.flatMap((company) => company.ranges.map((range) => range.id))
  const [selectedIds, setSelectedIds] = useState(allIds)
  const allSelected = selectedIds.length === allIds.length
  const noneSelected = selectedIds.length === 0 && allIds.length > 0
  const filtered = !allSelected && !noneSelected
  const query = api.benchmarkRanking.listHomepagePreviews.useQuery(
    { dateRange: 'all', anchorDate, modelRangeIds: selectedIds.slice().sort() },
    { enabled: filtered },
  )
  const previews = allSelected ? initialPreviews : query.data
  const params = new URLSearchParams()
  if (!allSelected) {
    for (const id of selectedIds) params.append('modelRangeIds', id)
  }
  const queryString = params.toString()
  const rankingHref = `/rankings/devtools${queryString ? `?${queryString}` : ''}`

  return (
    <div className="space-y-7">
      {companies.length > 0 && (
        <HomepageModelSelector
          companies={companies}
          selectedIds={selectedIds}
          onChange={setSelectedIds}
        />
      )}
      <section aria-labelledby="homepage-rankings-heading" aria-busy={filtered && query.isPending}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="homepage-rankings-heading" className="text-lg font-semibold">
              The most recommended devtools
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ranked by how often the selected LLMs recommend each tool. All time.
            </p>
          </div>
          {!noneSelected && (
            <Link
              href={rankingHref}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              All rankings <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
        <output className="sr-only" aria-live="polite">
          {noneSelected
            ? 'No models selected.'
            : filtered && query.isPending
              ? 'Updating rankings.'
              : filtered && query.isError
                ? 'Could not load rankings.'
                : `Showing rankings from ${selectedIds.length} model ranges.`}
        </output>
        {noneSelected ? (
          <div className="rounded-xl border border-dashed py-12 text-center">
            <h3 className="font-medium">Whose picks would you like to see?</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Select a model above to explore its recommendations.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setSelectedIds(allIds)}
            >
              Select all models
            </Button>
          </div>
        ) : filtered && query.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {initialPreviews.map((preview) => (
              <div
                key={preview.slug}
                className="h-60 animate-pulse rounded-xl border bg-muted/40 motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : filtered && query.isError ? (
          <div className="rounded-xl border py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Could not load these rankings. Please try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void query.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : previews && previews.length > 0 ? (
          <HomepageRankingsPreview previews={previews} queryString={queryString} />
        ) : (
          <EmptyState
            title="No rankings yet"
            description="Rankings appear after model recommendations have been measured and published."
          />
        )}
      </section>
    </div>
  )
}
