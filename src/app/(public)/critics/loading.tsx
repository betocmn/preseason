import { Skeleton } from '~/components/ui/skeleton'

export default function CriticsLoading() {
  return (
    <div className="container max-w-4xl py-8">
      <Skeleton className="mb-1 h-8 w-56" />
      <Skeleton className="mb-8 h-4 w-80" />
      <div className="space-y-4">
        {Array.from({ length: 4 }, (_, i) => `skeleton-${i}`).map((key) => (
          <Skeleton key={key} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
