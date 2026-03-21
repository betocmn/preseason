'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '~/components/public/theme-toggle'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

const MobileNav = dynamic(() => import('~/components/public/mobile-nav').then((m) => m.MobileNav), {
  ssr: false,
})

const navLinks = [
  { href: '/matches', label: 'Matches' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/critics', label: 'Critics' },
  { href: '/prompts', label: 'Prompts' },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <header className="border-b bg-background">
      <div className="container flex h-14 items-center gap-6">
        <Link href="/" className="mr-4">
          <Image
            src="/preseason-brand/preseason-logo.svg"
            alt="Preseason"
            width={112}
            height={26}
            priority
          />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-3 py-1.5 text-sm font-medium transition-colors hover:text-foreground',
                pathname.startsWith(link.href) ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ThemeToggle />
          <Button size="sm" asChild className="hidden md:inline-flex">
            <Link href="/signup">Sign up</Link>
          </Button>

          <MobileNav />
        </div>
      </div>
    </header>
  )
}
