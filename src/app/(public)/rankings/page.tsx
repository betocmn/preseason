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

export default async function RankingsPage() {
  redirect('/rankings/devtools')
}
