import { HomepageIntro } from '~/components/public/homepage-intro'
import { Skeleton } from '~/components/ui/skeleton'

export default function PublicLoading() {
  return (
    <div className="container px-4 py-6 sm:px-8 sm:py-10">
      <HomepageIntro />
      <div className="mb-7 rounded-xl border bg-card p-4 sm:p-5">
        <p className="mb-4 text-sm font-medium">Ranked by recommendations from</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {['anthropic', 'openai', 'deepseek', 'gemini', 'kimi', 'more'].map((key) => (
            <Skeleton key={key} className="h-16 rounded-lg" />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Loading model recommendations…</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => `ranking-${index}`).map((key) => (
          <Skeleton key={key} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
