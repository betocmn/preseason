import { Skeleton } from '~/components/ui/skeleton'

export default function FeedLoading() {
  return (
    <div className="container py-8">
      <Skeleton className="mb-6 h-8 w-64" />
      <div className="mb-6 flex gap-3">
        <Skeleton className="h-10 w-[180px]" />
        <Skeleton className="h-10 w-[180px]" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map((key) => (
          <Skeleton key={key} className="h-24 w-full" />
        ))}
      </div>
    </div>
  )
}
