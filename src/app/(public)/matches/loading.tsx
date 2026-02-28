import { Skeleton } from '~/components/ui/skeleton'

export default function MatchesLoading() {
  return (
    <div className="container py-8">
      <Skeleton className="mb-6 h-8 w-48" />
      <Skeleton className="mb-6 h-10 w-[200px]" />
      <Skeleton className="mb-4 h-6 w-40" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => `skeleton-${i}`).map((key) => (
          <Skeleton key={key} className="h-40 w-full" />
        ))}
      </div>
    </div>
  )
}
