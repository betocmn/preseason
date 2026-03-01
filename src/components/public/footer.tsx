import Link from 'next/link'

const footerLinks = [
  { href: '/feed', label: 'Feed' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/matches', label: 'Matches' },
  { href: '/critics', label: 'Critics' },
]

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container flex flex-col items-center justify-between gap-4 py-6 md:flex-row">
        <p className="text-sm text-muted-foreground">
          Preseason &mdash; What tools do AI models actually recommend?
        </p>
        <nav className="flex items-center gap-4">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
