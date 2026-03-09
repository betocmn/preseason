import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Business Access',
  description: 'API access and data licensing for Preseason recommendation data.',
  openGraph: {
    title: 'Business Access',
    description: 'API access and data licensing for Preseason recommendation data.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Business Access',
    description: 'API access and data licensing for Preseason recommendation data.',
  },
}

export default function BusinessPage() {
  return (
    <div className="container max-w-3xl py-12">
      <h1 className="text-2xl font-bold tracking-tight">Business Access</h1>
      <p className="mt-4 text-muted-foreground">This page is coming soon.</p>
    </div>
  )
}
