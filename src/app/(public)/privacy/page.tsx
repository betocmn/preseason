import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Preseason privacy policy — how we collect, use, and protect your data.',
  openGraph: { title: 'Privacy Policy', description: 'Preseason privacy policy — how we collect, use, and protect your data.' },
  twitter: { card: 'summary_large_image', title: 'Privacy Policy', description: 'Preseason privacy policy — how we collect, use, and protect your data.' },
}

export default function PrivacyPage() {
  return (
    <div className="container max-w-3xl py-12">
      <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-4 text-muted-foreground">This page is coming soon.</p>
    </div>
  )
}
