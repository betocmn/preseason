export const revalidate = false // fully static

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Methodology',
  description: 'How Preseason benchmarks tool recommendations and publishes public rankings.',
  openGraph: {
    title: 'Methodology',
    description: 'How Preseason benchmarks tool recommendations and publishes public rankings.',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Methodology',
    description: 'How Preseason benchmarks tool recommendations and publishes public rankings.',
    images: ['/opengraph-image'],
  },
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
}

export default function MethodologyPage() {
  return (
    <div className="container max-w-3xl py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Methodology</h1>
      </div>

      <div className="space-y-10">
        <Section title="What We Measure">
          <P>
            Preseason measures recommendation behavior, not product quality in the abstract. We ask
            a frozen panel of AI models which tools they would choose for realistic software
            building scenarios, then aggregate those decisions into public rankings and matchups.
          </P>
          <P>
            Every public result comes from published runs inside a frozen benchmark season. A season
            freezes the prompt versions, eligible categories, model snapshots, and run configuration
            so rankings stay comparable and traceable over time.
          </P>
        </Section>

        <Section title="Benchmark Design">
          <P>
            Prompts are versioned snapshots grouped by user prompting level: beginner, intermediate,
            and advanced. Each prompt version declares which tool categories should produce a
            decision, which keeps the evaluation target explicit.
          </P>
          <P>
            Model snapshots pin the provider, model identity, and inference settings used at
            evaluation time. Each benchmark run executes the full prompt-by-model matrix for the
            season, so each case can be reproduced and audited later.
          </P>
          <P>
            The current corpus is intentionally focused on web application and SaaS-style scenarios,
            which is important context when interpreting category leaders.
          </P>
        </Section>

        <Section title="Decision Capture">
          <P>
            In benchmark mode, a model returns both natural language and a structured appendix. For
            every eligible category in the prompt, that appendix must resolve to exactly one
            category-level decision: recommend a tool or explicitly say no tool is needed.
          </P>
          <P>
            We validate that appendix against the benchmark contract and store one case decision per
            category. Outputs that cannot be validated are excluded rather than inferred from prose.
          </P>
          <P>
            We also record the model identity returned by the provider so silent model swaps or
            other drift can be caught before a run is allowed into the public dataset.
          </P>
        </Section>

        <Section title="Tool Resolution">
          <P>
            Recommended tool names are resolved against Preseason&apos;s tool catalog and approved
            aliases. When a name cannot be mapped confidently, it goes into a review queue and does
            not count toward rankings until it is resolved.
          </P>
          <P>
            This keeps the public data conservative: unknown or ambiguous names are held out rather
            than silently forced into an existing tool entry.
          </P>
        </Section>

        <Section title="Scoring">
          <P>
            Rankings are computed from case decisions, not free-text mentions. The core metric is a
            tool&apos;s support rate: the share of eligible decisions that selected it within the
            chosen benchmark slice.
          </P>
          <P>
            We pair that rate with raw counts, Wilson confidence intervals, model coverage, prompt
            coverage, and trend versus the previous non-overlapping published-run window. Rankings
            are ordered by weighted support rate, with confidence and count used to break ties.
          </P>
          <P>
            The scoring layer supports model-tier weighting, and the weight configuration is frozen
            with each run so historical results remain auditable.
          </P>
        </Section>

        <Section title="Publication Standards">
          <P>
            Only published runs feed the public site. Before a run can appear publicly, it must
            clear quality checks around execution success, structured-output validity, unresolved
            tool rate, and panel coverage.
          </P>
          <P>
            For category rankings, we only treat the result as benchmark-ready when the window has
            enough eligible decisions and enough diversity across both prompts and models.
          </P>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>At least 100 eligible case decisions</li>
            <li>At least 3 distinct model snapshots contributing</li>
            <li>At least 3 distinct prompt versions contributing</li>
          </ul>
          <P>
            Categories below those thresholds are labeled as insufficient data instead of being
            presented as authoritative. Head-to-head tool matchups require at least 30 decisive
            cases before we publish them as benchmark-ready.
          </P>
        </Section>

        <Section title="Scope and Filters">
          <P>
            Public rankings can be filtered by prompting level, model tier, and specific frozen
            model version. By default, public reads resolve against the latest published season.
          </P>
          <P>
            That makes the benchmark useful for questions like &ldquo;what do frontier models prefer
            for advanced requests?&rdquo; without pretending the answer generalizes to every product
            category or engineering context.
          </P>
        </Section>

        <Section title="How to Read Rankings">
          <P>
            A high rank means models in this benchmark panel frequently recommend a tool for the
            scoped scenarios. It does not mean the tool is objectively best in every context, and it
            does not replace hands-on evaluation by an engineering team.
          </P>
          <P>
            The benchmark is meant to make model behavior legible and auditable: what gets
            recommended, how often, under which prompts, and with what level of statistical support.
          </P>
        </Section>
      </div>
    </div>
  )
}
