import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getServerUser } from '~/lib/auth'
import { db } from '~/server/db'
import { userProfiles } from '~/server/db/schema'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()

  if (!user) {
    redirect('/login?redirectTo=/admin')
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
          <a href="/admin" className="text-xl font-semibold">
            Preseason Admin
          </a>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {[
            { href: '/admin/dashboard', label: 'Dashboard' },
            { href: '/admin/prompts', label: 'Prompts' },
            { href: '/admin/tools', label: 'Tools' },
            { href: '/admin/categories', label: 'Categories' },
            { href: '/admin/llms', label: 'LLMs' },
            { href: '/admin/runs', label: 'Runs' },
            { href: '/admin/matches', label: 'Matches' },
            { href: '/admin/critics', label: 'Critics' },
            { href: '/admin/users', label: 'Users' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6">
          <div className="flex-1" />
          <span className="text-sm text-muted-foreground">Admin</span>
        </header>
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
