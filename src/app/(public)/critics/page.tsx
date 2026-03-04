import type { Metadata } from 'next'
import { CommentaryFeed } from '~/components/public/commentary-feed'
import { CriticsGrid } from '~/components/public/critics-grid'
import { api } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Critics | Preseason',
  description: 'Verified critics who provide expert commentary on tool recommendations.',
}

export default async function CriticsPage() {
  const caller = await api()
  const recentComments = await caller.comment.listRecent()

  return (
    <div className="container py-8">
      {/* Critics compact grid */}
      <div className="mb-10">
        <h1 className="mb-4 text-xl font-bold tracking-tight">Verified Critics</h1>
        <CriticsGrid />
      </div>

      {/* Recent commentary feed */}
      {recentComments.length > 0 && (
        <div>
          <h2 className="mb-4 text-xl font-bold tracking-tight">Recent Commentary</h2>
          <CommentaryFeed comments={recentComments} />
        </div>
      )}
    </div>
  )
}
