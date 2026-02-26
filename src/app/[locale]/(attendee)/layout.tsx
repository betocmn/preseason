import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { AttendeeLayout } from '~/components/attendee/attendee-layout'
import { getServerUser } from '~/lib/auth'
import { db } from '~/server/db'
import { userProfiles } from '~/server/db/schema'

export default async function AttendeeRouteLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()

  if (!user) {
    redirect('/login')
  }

  // Check if user is admin - redirect to admin panel
  const profile = await db.query.userProfiles.findFirst({
    where: eq(userProfiles.id, user.id),
  })

  if (profile?.role === 'admin') {
    redirect('/manage')
  }

  return <AttendeeLayout>{children}</AttendeeLayout>
}
