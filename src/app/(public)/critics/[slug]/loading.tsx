import { Skeleton } from '~/components/ui/skeleton'

export default function CriticDetailLoading() {
  return (
    <div className="container max-w-3xl py-8">
      <Skeleton className="mb-6 h-4 w-24" />
      <div className="mb-8 mt-4 flex items-start gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <Skeleton className="mb-8 h-px w-full" />
      <Skeleton className="mb-4 h-6 w-36" />
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => `skeleton-${i}`).map((key) => (
          <Skeleton key={key} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
