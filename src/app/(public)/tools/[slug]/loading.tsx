import { Skeleton } from '~/components/ui/skeleton'

export default function ToolDetailLoading() {
  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <Skeleton className="mb-3 h-8 w-48" />
        <Skeleton className="mb-3 h-5 w-full max-w-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
      </div>
      <Skeleton className="mb-8 h-48 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
