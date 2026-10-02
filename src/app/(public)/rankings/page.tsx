import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Rankings',
  description: 'Benchmark-grade rankings of the developer tools LLMs recommend across categories.',
  openGraph: {
    title: 'Rankings',
    description:
      'Benchmark-grade rankings of the developer tools LLMs recommend across categories.',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rankings',
    description:
      'Benchmark-grade rankings of the developer tools LLMs recommend across categories.',
    images: ['/opengraph-image'],
  },
}

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      params.append(key, item)
    }
  }
  const query = params.toString()
  redirect(query ? `/rankings/devtools?${query}` : '/rankings/devtools')
}
