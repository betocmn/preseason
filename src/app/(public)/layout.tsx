import { Footer } from '~/components/public/footer'
import { Navbar } from '~/components/public/navbar'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
