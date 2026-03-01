import { Skeleton } from '~/components/ui/skeleton'

export default function CriticsLoading() {
  return (
    <div className="container py-8">
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => `skeleton-${i}`).map((key) => (
          <Skeleton key={key} className="h-28 w-full" />
        ))}
      </div>
    </div>
  )
}
