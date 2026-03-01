'use client'

import { Menu, Search } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '~/components/public/theme-toggle'
import { Button } from '~/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '~/components/ui/sheet'
import { cn } from '~/lib/utils'

const categories = [
  { slug: 'devtools', label: 'Devtools' },
  { slug: 'salestech', label: 'Salestech' },
  { slug: 'martech', label: 'Martech' },
  { slug: 'fintech', label: 'Fintech' },
  { slug: 'hr-tech', label: 'HR Tech' },
  { slug: 'healthcare', label: 'Healthcare' },
  { slug: 'edtech', label: 'Edtech' },
  { slug: 'cybersecurity', label: 'Cybersecurity' },
]

const navLinks = [
  { href: '/feed', label: 'Feed' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/matches', label: 'Matches' },
  { href: '/critics', label: 'Critics' },
]

export function Navbar() {
  const pathname = usePathname()

  const activeCategory = categories.find(
    (c) => pathname === `/rankings/${c.slug}` || pathname.startsWith(`/rankings/${c.slug}/`),
  )

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      {/* Main nav bar */}
      <div className="container flex h-14 items-center gap-4">
        <Link href="/" className="mr-2 text-lg font-bold tracking-tight">
          Preseason
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-foreground',
                pathname.startsWith(link.href)
                  ? 'text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild className="hidden md:inline-flex">
            <Link href="/login">Log in</Link>
          </Button>
          <Button size="sm" asChild className="hidden md:inline-flex">
            <Link href="/signup">Sign up</Link>
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <nav className="mt-6 flex flex-col gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
                      pathname.startsWith(link.href) && 'bg-accent font-medium',
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
                <hr className="my-2" />
                <p className="px-3 py-1 text-xs font-medium text-muted-foreground">Categories</p>
                {categories.map((cat) => (
                  <Link
                    key={cat.slug}
                    href={`/rankings/${cat.slug}`}
                    className={cn(
                      'rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
                      activeCategory?.slug === cat.slug && 'bg-accent font-medium',
                    )}
                  >
                    {cat.label}
                  </Link>
                ))}
                <hr className="my-2" />
                <Link href="/login" className="rounded-md px-3 py-2 text-sm hover:bg-accent">
                  Log in
                </Link>
                <Link href="/signup" className="rounded-md px-3 py-2 text-sm hover:bg-accent">
                  Sign up
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Category sub-nav — Kalshi-style horizontal tabs */}
      <div className="border-t">
        <div className="container">
          <nav className="hidden items-center gap-0 overflow-x-auto md:flex">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/rankings/${cat.slug}`}
                className={cn(
                  'whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors hover:text-foreground',
                  activeCategory?.slug === cat.slug
                    ? 'border-foreground text-foreground'
                    : 'border-transparent text-muted-foreground',
                )}
              >
                {cat.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  )
}
