import { Skeleton } from '~/components/ui/skeleton'

export default function PromptDetailLoading() {
  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <Skeleton className="mb-2 h-8 w-64" />
        <Skeleton className="h-5 w-24" />
      </div>
      <Skeleton className="mb-6 h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
