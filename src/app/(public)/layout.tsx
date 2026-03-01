import { Footer } from '~/components/public/footer'
import { Navbar } from '~/components/public/navbar'
import { api } from '~/trpc/server'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const caller = await api()
  const groups = await caller.category.listGroups()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar categoryGroups={groups} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
