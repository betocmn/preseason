import type { Metadata } from 'next'
import { Badge } from '~/components/ui/badge'

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'How Preseason tests AI models, scores tool recommendations, and generates rankings.',
  openGraph: {
    title: 'Methodology',
    description:
      'How Preseason tests AI models, scores tool recommendations, and generates rankings.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Methodology',
    description:
      'How Preseason tests AI models, scores tool recommendations, and generates rankings.',
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
      <div className="mb-8 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Methodology</h1>
        <Badge variant="secondary" className="text-xs">
          Benchmark
        </Badge>
      </div>

      <div className="space-y-10">
        <Section title="How We Test">
          <P>
            Preseason runs a daily benchmark that asks a panel of AI models what tools they would
            recommend for specific development scenarios. Each benchmark run evaluates every
            combination of prompt and model in the active season.
          </P>
          <P>
            <strong className="text-foreground">Prompt panel:</strong> A curated set of development
            scenarios ranging from simple applications to complex multi-service architectures. Each
            prompt is classified by difficulty tier (basic, intermediate, advanced) and specifies
            which tool categories are relevant.
          </P>
          <P>
            <strong className="text-foreground">Model panel:</strong> A provider-balanced set of AI
            models spanning frontier, mid-tier, and smaller models. Each model is tested with
            explicit, frozen inference parameters (temperature, top_p, max_tokens) to ensure
            reproducibility.
          </P>
          <P>
            <strong className="text-foreground">Immutable snapshots:</strong> Both prompts and model
            configurations are frozen as immutable snapshots within each season. This ensures that
            rankings are always traceable to the exact inputs that produced them.
          </P>
        </Section>

        <Section title="Structured Output">
          <P>
            For benchmark runs, each model must return a machine-readable response in a strict
            format. For every eligible tool category in the prompt, the model provides a decision:
            recommend a specific tool, or indicate that no tool is needed for that category.
          </P>
          <P>
            Responses that do not conform to the expected format are marked as invalid and excluded
            from rankings. There is no heuristic parsing or attempt to rescue malformed outputs.
            This strict approach ensures data quality at the cost of some data volume.
          </P>
        </Section>

        <Section title="Scoring">
          <P>
            The fundamental unit of measurement is a{' '}
            <strong className="text-foreground">case decision</strong>: one model&apos;s tool choice
            for one category in one prompt evaluation.
          </P>
          <P>
            <strong className="text-foreground">Support rate:</strong> The fraction of eligible
            decisions that selected a given tool. Shown as a percentage with the raw count (e.g.,
            35.2% with 42/119 decisions).
          </P>
          <P>
            <strong className="text-foreground">Confidence interval:</strong> A Wilson 95%
            confidence interval on the raw support rate. Narrower intervals indicate more reliable
            rankings. The CI is computed on unweighted counts.
          </P>
          <P>
            <strong className="text-foreground">Model coverage:</strong> The percentage of distinct
            model snapshots that recommended this tool. High coverage means broad consensus across
            different AI models.
          </P>
          <P>
            <strong className="text-foreground">Prompt coverage:</strong> The percentage of distinct
            prompt versions that produced a recommendation for this tool. High coverage means the
            tool is recommended across diverse development scenarios.
          </P>
          <P>
            <strong className="text-foreground">Trend:</strong> The change in support rate compared
            to the previous non-overlapping time window of the same type.
          </P>
        </Section>

        <Section title="Model Weighting">
          <P>
            Each case decision can carry a weight based on its model&apos;s capability tier
            (frontier, mid, small). The weight configuration is versioned and snapshotted per run,
            so historical results always reference the exact weights that produced them.
          </P>
          <P>
            <strong className="text-foreground">Season 1 uses uniform weights</strong> (all model
            tiers = 1.0). This means every model gets one equal vote. We believe this is the most
            transparent and defensible approach for a first release. Non-uniform weighting may be
            introduced in future seasons once we have data to justify tier differentiation.
          </P>
          <P>
            Both weighted and unweighted metrics are always computed and displayed. When weights are
            uniform, they are identical.
          </P>
        </Section>

        <Section title="Publication Thresholds">
          <P>
            A category ranking is only published as authoritative when it meets minimum data
            thresholds:
          </P>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>At least 100 eligible case decisions</li>
            <li>At least 3 distinct model snapshots contributing</li>
            <li>At least 3 distinct prompt versions contributing</li>
          </ul>
          <P>
            Categories below these thresholds display &ldquo;Insufficient benchmark data&rdquo;
            rather than publishing potentially misleading rankings. Head-to-head comparisons require
            at least 30 decisive cases.
          </P>
        </Section>

        <Section title="Tool Resolution">
          <P>
            When a model recommends a tool, we match it against our database of known tools and
            approved aliases. If no match is found, the tool name enters a review queue for manual
            resolution. Unresolved tools are excluded from rankings until reviewed.
          </P>
          <P>
            Tools are never auto-created from model output. This prevents hallucinated or misspelled
            tool names from polluting the database.
          </P>
        </Section>

        <Section title="Time Windows">
          <P>Rankings are computed over explicit time windows:</P>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Trailing 28 days</strong> (default): Last 28
              published runs. Balances recency with statistical mass.
            </li>
            <li>
              <strong className="text-foreground">Trailing 7 days:</strong> Short-term trend view.
            </li>
            <li>
              <strong className="text-foreground">Season to date:</strong> All published runs in the
              current season.
            </li>
          </ul>
        </Section>

        <Section title="What Rankings Reflect">
          <P>
            Rankings reflect what AI models recommend when asked about tool choices for development
            scenarios. They are <strong className="text-foreground">not</strong> independent quality
            evaluations of the tools themselves.
          </P>
          <P>
            A tool&apos;s ranking is influenced by its presence in AI training data, its popularity
            in developer communities, and how well it fits the specific scenarios in our prompt
            panel.
          </P>
        </Section>

        <Section title="Scope">
          <P>
            The current prompt panel focuses on{' '}
            <strong className="text-foreground">web application development</strong> scenarios,
            primarily full-stack and SaaS applications. Rankings should be interpreted within this
            scope.
          </P>
          <P>
            Categories with limited prompt coverage (few prompts mentioning that category) will show
            reduced confidence and may fall below publication thresholds. This is by design — we
            prefer honesty about coverage gaps over thin rankings.
          </P>
        </Section>

        <Section title="Transparency">
          <P>
            Every published ranking can be traced back to the exact prompt versions, model
            snapshots, inference parameters, and weight configuration that produced it. The active
            weight configuration is always visible. If non-uniform weights are ever used, the exact
            values will be listed here.
          </P>
          <P>
            <strong className="text-foreground">Current weight config:</strong> Uniform (frontier =
            1.0, mid = 1.0, small = 1.0).
          </P>
        </Section>
      </div>
    </div>
  )
}
