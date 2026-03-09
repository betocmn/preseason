import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn about Preseason and our mission to track what tools AI models recommend.',
  openGraph: {
    title: 'About',
    description: 'Learn about Preseason and our mission to track what tools AI models recommend.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About',
    description: 'Learn about Preseason and our mission to track what tools AI models recommend.',
  },
}

export default function AboutPage() {
  return (
    <div className="container max-w-3xl py-12">
      <h1 className="text-2xl font-bold tracking-tight">About Preseason</h1>
      <p className="mt-4 text-muted-foreground">This page is coming soon.</p>
    </div>
  )
}
