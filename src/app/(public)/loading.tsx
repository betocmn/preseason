import { Skeleton } from '~/components/ui/skeleton'

export default function PublicLoading() {
  return (
    <div className="container py-8">
      <div className="space-y-10">
        {/* Hero + Latest Prompts */}
        <section className="grid items-stretch gap-4 lg:grid-cols-[2fr_3fr]">
          <div className="flex flex-col justify-center gap-4 rounded-lg border bg-card px-6 py-8">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </section>

        {/* Active Matches */}
        <section>
          <Skeleton className="mb-4 h-5 w-36" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => `match-${i}`).map((key) => (
              <div key={key} className="rounded-lg border p-4">
                <Skeleton className="mb-2 h-5 w-20" />
                <div className="mb-3 flex items-center gap-1.5">
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-6" />
                  <Skeleton className="h-5 w-5 rounded-full" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-4 w-full rounded-full" />
              </div>
            ))}
          </div>
        </section>

        {/* Latest Verified Critics */}
        <section>
          <Skeleton className="mb-4 h-5 w-44" />
          <div className="space-y-4">
            {Array.from({ length: 5 }, (_, i) => `comment-${i}`).map((key) => (
              <div key={key} className="py-4">
                <Skeleton className="mb-2 h-4 w-48" />
                <Skeleton className="mb-2 h-14 w-full" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
