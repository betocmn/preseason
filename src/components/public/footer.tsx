import Image from 'next/image'
import Link from 'next/link'

const linkGroups = [
  {
    title: 'Product',
    links: [
      { href: '/matches', label: 'Live Matches' },
      { href: '/rankings', label: 'Rankings' },
      { href: '/prompts', label: 'Prompts' },
      { href: '/critics', label: 'Critics' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/methodology', label: 'Methodology' },
      { href: '/business', label: 'Business Access' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms & Conditions' },
    ],
  },
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
      <div className="container py-10">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          {/* Brand */}
          <div className="max-w-xs">
            <Link href="/">
              <Image
                src="/preseason-brand/preseason-logo.svg"
                alt="Preseason"
                width={120}
                height={28}
                className="mb-3"
                style={{ filter: 'var(--logo-filter)' }}
              />
            </Link>
            <p className="text-sm leading-relaxed text-muted-foreground">
              What tools do AI models actually recommend?
            </p>
            <p className="mt-3 text-xs text-muted-foreground/50">
              &copy; {new Date().getFullYear()} Preseason. All rights reserved.
            </p>
          </div>

          {/* Link groups */}
          <div className="flex flex-wrap gap-12 sm:gap-16">
            {linkGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {group.title}
                </p>
                <ul className="space-y-2">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
