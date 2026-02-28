import { Skeleton } from '~/components/ui/skeleton'

export default function PublicLoading() {
  return (
    <div className="container py-8">
      <div className="mb-12 text-center">
        <Skeleton className="mx-auto mb-3 h-12 w-96" />
        <Skeleton className="mx-auto mb-6 h-6 w-80" />
        <div className="flex justify-center gap-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {Array.from({ length: 4 }, (_, i) => `skeleton-${i}`).map((key) => (
            <Skeleton key={key} className="h-24 w-full" />
          ))}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  )
}
