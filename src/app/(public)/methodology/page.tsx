import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Methodology',
  description: 'How Preseason tests AI models, scores tool recommendations, and generates rankings.',
  openGraph: { title: 'Methodology', description: 'How Preseason tests AI models, scores tool recommendations, and generates rankings.' },
  twitter: { card: 'summary_large_image', title: 'Methodology', description: 'How Preseason tests AI models, scores tool recommendations, and generates rankings.' },
}

export default function MethodologyPage() {
  return (
    <div className="container max-w-3xl py-12">
      <h1 className="text-2xl font-bold tracking-tight">Methodology</h1>
      <p className="mt-4 text-muted-foreground">This page is coming soon.</p>
    </div>
  )
}
