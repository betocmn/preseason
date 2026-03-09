import { Skeleton } from '~/components/ui/skeleton'

export default function MatchDetailLoading() {
  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <div className="mb-3 flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="mb-4 h-8 w-72" />
        <Skeleton className="mb-4 h-10 w-full" />
      </div>
      <Skeleton className="mb-8 h-64 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}
