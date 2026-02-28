import { Skeleton } from '~/components/ui/skeleton'

export default function LlmDetailLoading() {
  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <Skeleton className="mb-2 h-8 w-48" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="mb-4 h-6 w-56" />
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => `skeleton-${i}`).map((key) => (
          <Skeleton key={key} className="h-48 w-full" />
        ))}
      </div>
    </div>
  )
}
