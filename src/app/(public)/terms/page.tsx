import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: 'Preseason terms and conditions of use.',
  openGraph: { title: 'Terms & Conditions', description: 'Preseason terms and conditions of use.' },
  twitter: { card: 'summary_large_image', title: 'Terms & Conditions', description: 'Preseason terms and conditions of use.' },
}

export default function TermsPage() {
  return (
    <div className="container max-w-3xl py-12">
      <h1 className="text-2xl font-bold tracking-tight">Terms & Conditions</h1>
      <p className="mt-4 text-muted-foreground">This page is coming soon.</p>
    </div>
  )
}
