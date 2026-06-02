import { Skeleton } from '~/components/ui/skeleton'

export default function RankingsLoading() {
  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="ml-auto h-4 w-24" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => `filter-${i}`).map((key) => (
          <Skeleton key={key} className="h-9 w-32 rounded-md" />
        ))}
      </div>

      {/* Category group cards grid */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => `group-${i}`).map((key) => (
          <div key={key} className="rounded-lg border p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-4 w-10" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, j) => `item-${j}`).map((itemKey) => (
                <div
                  key={itemKey}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-6 w-6 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
