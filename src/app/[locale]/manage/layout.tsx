import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { AdminLayout } from '~/components/manage/admin-layout'
import { getServerUser } from '~/lib/auth'
import { db } from '~/server/db'
import { userProfiles } from '~/server/db/schema'

export default async function ManageRouteLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()

  if (!user) {
    redirect('/login?redirectTo=/manage')
  }

  // Check if user is admin
  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.id, user.id),
  })

  if (profile?.role !== 'admin') {
    redirect('/') // Non-admins go to attendee UI
  }

  return <AdminLayout>{children}</AdminLayout>
}
