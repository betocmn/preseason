import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'

export function HomepageIntro() {
  return (
    <section className="mb-5 flex flex-col sm:mb-7 justify-between gap-5 lg:flex-row lg:items-end">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          The devtools AI chooses.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          We give LLMs the same app-building prompts, then rank the tools they recommend.
        </p>
      </div>
      <Link
        href="/methodology"
        className="hidden shrink-0 sm:inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground transition-colors hover:text-foreground lg:mb-1 lg:self-auto"
      >
        How we measure <ArrowUpRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  )
}
