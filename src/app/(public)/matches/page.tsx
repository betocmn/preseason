import type { Metadata } from 'next'
import Link from 'next/link'
import { MatchesPageContent } from '~/components/public/matches-page-content'
import { Badge } from '~/components/ui/badge'

export const metadata: Metadata = {
  title: 'Head-to-Head',
  description: 'Benchmark head-to-head tool comparisons based on LLM recommendations.',
  openGraph: {
    title: 'Head-to-Head',
    description: 'Benchmark head-to-head tool comparisons based on LLM recommendations.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Head-to-Head',
    description: 'Benchmark head-to-head tool comparisons based on LLM recommendations.',
  },
}

type Props = {
  searchParams: Promise<{ category?: string }>
}

export default async function MatchesPage({ searchParams }: Props) {
  const { category } = await searchParams

  return (
    <div className="container py-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">Head-to-Head</h1>
        <Badge variant="secondary" className="text-xs">
          Benchmark
        </Badge>
        <Link
          href="/methodology"
          className="ml-auto text-sm text-muted-foreground hover:text-foreground"
        >
          Methodology
        </Link>
      </div>

      <p className="mb-6 text-sm text-muted-foreground">
        Auto-generated matchups between the top tools in each category, based on benchmark case
        decisions.
      </p>

      <MatchesPageContent initialCategorySlug={category} />
    </div>
  )
}
