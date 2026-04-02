import { Skeleton } from '~/components/ui/skeleton'

export default function PromptsLoading() {
  return (
    <div className="container py-8">
      <Skeleton className="mb-6 h-7 w-28" />

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 3 }, (_, i) => `filter-${i}`).map((key) => (
          <Skeleton key={key} className="h-9 w-32 rounded-md" />
        ))}
      </div>

      {/* Prompt cards grid */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => `prompt-${i}`).map((key) => (
          <div key={key} className="rounded-lg border p-4">
            <Skeleton className="mb-2 h-5 w-20" />
            <Skeleton className="mb-1 h-5 w-3/4" />
            <Skeleton className="mb-2 h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <div className="mt-2 flex gap-1">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
