export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <span className="text-xl font-bold">Preseason</span>
          <a href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </a>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  )
}
