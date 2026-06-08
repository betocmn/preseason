'use client'

import { Github } from 'lucide-react'
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
            width={126}
            height={29}
            priority
            unoptimized
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
          <Button variant="ghost" size="sm" className="w-9 px-0" asChild>
            <a
              href="https://github.com/betocmn/preseason/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View source on GitHub"
            >
              <Github className="h-4 w-4" />
            </a>
          </Button>

          <ThemeToggle />
          <Button size="sm" asChild className="hidden md:inline-flex">
            <Link href="/contact">Contact</Link>
          </Button>

          <MobileNav />
        </div>
      </div>
    </header>
  )
}
