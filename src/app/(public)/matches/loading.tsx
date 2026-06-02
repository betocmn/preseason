import { Skeleton } from '~/components/ui/skeleton'

export default function MatchesLoading() {
  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="ml-auto h-4 w-24" />
      </div>

      <Skeleton className="mb-6 h-4 w-[420px] max-w-full" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => `match-${i}`).map((key) => (
          <div key={key} className="rounded-lg border p-4">
            <Skeleton className="mb-2 h-5 w-20" />
            <div className="mb-3 flex items-center gap-1.5">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
