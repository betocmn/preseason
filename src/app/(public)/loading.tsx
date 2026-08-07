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

        {/* Top Devtool Rankings */}
        <section>
          <Skeleton className="mb-4 h-5 w-44" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => `ranking-${i}`).map((key) => (
              <div key={key} className="rounded-lg border p-4">
                <Skeleton className="mb-4 h-5 w-32" />
                <div className="space-y-2">
                  {Array.from({ length: 5 }, (_, j) => `${key}-tool-${j}`).map((rowKey) => (
                    <div
                      key={rowKey}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/50 px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-3 w-3" />
                        <Skeleton className="h-5 w-5 rounded-full" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                      <Skeleton className="h-4 w-10" />
                    </div>
                  ))}
                </div>
                <Skeleton className="mt-3 h-8 w-full" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
