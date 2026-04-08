import type { Metadata } from 'next'
import { CriticsGrid } from '~/components/public/critics-grid'
import { RecentCommentaryList } from '~/components/public/recent-commentary-list'

export const metadata: Metadata = {
  title: 'Critics',
  description: 'Verified critics who provide expert commentary on tool recommendations.',
  openGraph: {
    title: 'Critics',
    description: 'Verified critics who provide expert commentary on tool recommendations.',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Critics',
    description: 'Verified critics who provide expert commentary on tool recommendations.',
    images: ['/opengraph-image'],
  },
}

export default function CriticsPage() {
  return (
    <div className="container py-8">
      {/* Critics compact grid */}
      <div className="mb-10">
        <h1 className="mb-4 text-xl font-bold tracking-tight">Verified Critics</h1>
        <CriticsGrid />
      </div>

      {/* Recent commentary feed */}
      <div>
        <h2 className="mb-4 text-xl font-bold tracking-tight">Recent Commentary</h2>
        <RecentCommentaryList />
      </div>
    </div>
  )
}
