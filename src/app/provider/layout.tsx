import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getServerUser } from '~/lib/auth'
import { db } from '~/server/db'
import { userProfiles } from '~/server/db/schema'

export default async function ProviderLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser().catch(() => null)

  if (!user) {
    redirect('/login?redirectTo=/provider')
  }

  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.id, user.id),
  })

  if (profile?.role !== 'provider') {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <span className="text-xl font-bold">Preseason Provider</span>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl p-4 lg:p-6">{children}</main>
    </div>
  )
}
