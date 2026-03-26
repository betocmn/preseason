import { eq } from 'drizzle-orm'
import Image from 'next/image'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerUser } from '~/lib/auth'
import { db } from '~/server/db'
import { userProfiles } from '~/server/db/schema'
import { AdminHeader } from './_components/admin-header'
import { AdminNav } from './_components/admin-nav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()

  if (!user) {
    redirect('/login?redirectTo=/beto-admin')
  }

  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.id, user.id),
  })

  if (profile?.role !== 'admin') {
    redirect('/')
  }

  return (
    <div className="min-h-screen bg-muted/40">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r bg-background lg:flex">
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/beto-admin">
            <Image
              src="/preseason-brand/preseason-logo.svg"
              alt="Preseason"
              width={120}
              height={28}
              priority
            />
          </Link>
        </div>
        <AdminNav />
      </aside>
      <div className="lg:pl-64">
        <AdminHeader displayName={profile.displayName ?? profile.email} />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
