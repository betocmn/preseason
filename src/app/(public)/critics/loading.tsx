import { Skeleton } from '~/components/ui/skeleton'

export default function CriticsLoading() {
  return (
    <div className="container py-8">
      <Skeleton className="mb-1 h-8 w-56" />
      <Skeleton className="mb-8 h-4 w-80" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => `skeleton-${i}`).map((key) => (
          <Skeleton key={key} className="h-56 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
