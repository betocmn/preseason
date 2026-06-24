export const revalidate = 3600 // 1 hour

import type { Metadata } from 'next'
import { CriticsGrid } from '~/components/public/critics-grid'
import { RecentCommentaryList } from '~/components/public/recent-commentary-list'
import { deferToRequestWhenDatabaseUnavailable } from '~/server/prerender'
import { publicApi } from '~/trpc/server'

export const metadata: Metadata = {
  title: 'Critics',
  description: 'Verified critics who provide expert commentary on devtool recommendations.',
  openGraph: {
    title: 'Critics',
    description: 'Verified critics who provide expert commentary on devtool recommendations.',
    images: ['/opengraph-image'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Critics',
    description: 'Verified critics who provide expert commentary on devtool recommendations.',
    images: ['/opengraph-image'],
  },
}

export default async function CriticsPage() {
  await deferToRequestWhenDatabaseUnavailable()
  const caller = await publicApi()
  const [criticsData, commentsData] = await Promise.all([
    caller.critic.listWithCount({ limit: 12, offset: 0 }),
    caller.comment.listRecent({ limit: 10, offset: 0 }),
  ])

  return (
    <div className="container py-8">
      {/* Critics compact grid */}
      <div className="mb-10">
        <h1 className="mb-4 text-xl font-bold tracking-tight">Verified Critics</h1>
        <CriticsGrid initialItems={criticsData.items} initialTotal={criticsData.total} />
      </div>

      {/* Recent commentary feed */}
      <div>
        <h2 className="mb-4 text-xl font-bold tracking-tight">Recent Commentary</h2>
        <RecentCommentaryList initialItems={commentsData.items} initialTotal={commentsData.total} />
      </div>
    </div>
  )
}
