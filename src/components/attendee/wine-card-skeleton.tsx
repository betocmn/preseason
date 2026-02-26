import { Skeleton } from '~/components/ui/skeleton'

export function WineCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
        <div key={i} className="flex gap-3 rounded-lg border bg-card p-3">
          <Skeleton className="h-20 w-20 shrink-0 rounded-md" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}
