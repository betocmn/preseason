import { Skeleton } from '~/components/ui/skeleton'

export default function RankingsLoading() {
  return (
    <div className="container py-8">
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="flex gap-8">
        <div className="hidden w-48 space-y-2 md:block">
          {Array.from({ length: 10 }, (_, i) => `skeleton-${i}`).map((key) => (
            <Skeleton key={key} className="h-8 w-full" />
          ))}
        </div>
        <div className="flex-1">
          <Skeleton className="mb-4 h-6 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    </div>
  )
}
