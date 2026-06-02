import Image from 'next/image'
import Link from 'next/link'

const navLinks = [
  { href: '/matches', label: 'Matches' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/prompts', label: 'Prompts' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/contact', label: 'Contact' },
]

const legalLinks = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms & Conditions' },
]

export function Footer() {
  return (
    <footer
      className="border-t"
      style={{
        background:
          'linear-gradient(130deg, rgba(115,237,255,0.12) 0%, rgba(90,147,255,0.15) 40%, rgba(170,159,255,0.12) 70%, rgba(115,237,255,0.12) 100%)',
      }}
    >
      <div className="container py-8">
        {/* Top row: brand + nav links */}
        <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <Link href="/">
            <Image
              src="/preseason-brand/preseason-logo.svg"
              alt="Preseason"
              width={120}
              height={28}
              unoptimized
              style={{ filter: 'var(--logo-filter)' }}
            />
          </Link>

          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Divider */}
        <div className="my-5 border-t border-border/40" />

        {/* Bottom row: copyright + legal */}
        <div className="flex flex-col items-start gap-3 text-xs text-muted-foreground/50 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Preseason. All rights reserved.</p>
          <div className="flex gap-4">
            {legalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-muted-foreground"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
