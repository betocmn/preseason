import { Skeleton } from '~/components/ui/skeleton'

export default function CategoryRankingLoading() {
  return (
    <div className="container py-8">
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="flex gap-8">
        <div className="hidden w-48 space-y-2 md:block">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
        <div className="flex-1">
          <Skeleton className="mb-4 h-6 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    </div>
  )
}
