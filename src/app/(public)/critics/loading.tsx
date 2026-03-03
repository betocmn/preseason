import { Skeleton } from '~/components/ui/skeleton'

export default function CriticsLoading() {
  return (
    <div className="container py-8">
      <Skeleton className="mb-4 h-7 w-44" />
      <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => `critic-${i}`).map((key) => (
          <Skeleton key={key} className="h-14 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="mb-4 h-7 w-52" />
      <div className="space-y-4">
        {Array.from({ length: 5 }, (_, i) => `comment-${i}`).map((key) => (
          <div key={key} className="py-4">
            <Skeleton className="mb-2 h-4 w-48" />
            <Skeleton className="mb-2 h-14 w-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    </div>
  )
}
