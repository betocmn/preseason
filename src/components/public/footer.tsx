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
          <div className="flex items-center gap-4">
            {legalLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-muted-foreground"
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://x.com/betocmn"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="@betocmn on X"
              className="inline-flex flex-shrink-0 items-center gap-1.5 font-mono opacity-70 transition-opacity hover:text-foreground hover:opacity-100"
            >
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                aria-hidden="true"
                className="box-content rounded-full border border-border bg-background p-1"
              >
                <path
                  fill="currentColor"
                  d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
                />
              </svg>
              <span>@betocmn</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
