'use client'

import { Menu } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '~/components/public/theme-toggle'
import { Button } from '~/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '~/components/ui/sheet'
import { cn } from '~/lib/utils'

type CategoryGroup = {
  id: string
  name: string
  slug: string
}

type NavbarProps = {
  categoryGroups: CategoryGroup[]
}

const navLinks = [
  { href: '/feed', label: 'Feed' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/matches', label: 'Matches' },
  { href: '/critics', label: 'Critics' },
]

const DEFAULT_GROUP_SLUG = 'devtools'

export function Navbar({ categoryGroups }: NavbarProps) {
  const pathname = usePathname()

  const isRankingsSection = pathname === '/rankings' || pathname.startsWith('/rankings/')

  const activeGroupSlug =
    categoryGroups.find(
      (c) => pathname === `/rankings/${c.slug}` || pathname.startsWith(`/rankings/${c.slug}/`),
    )?.slug ?? (isRankingsSection ? DEFAULT_GROUP_SLUG : undefined)

  return (
    <header className="sticky top-0 z-50 bg-background">
      {/* Main nav bar */}
      <div className="container flex h-16 items-center gap-6">
        <Link href="/" className="mr-4 text-xl font-bold tracking-tight">
          Preseason
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-3 py-1.5 text-[15px] font-semibold uppercase tracking-wide transition-colors hover:text-foreground',
                pathname.startsWith(link.href) ? 'text-foreground' : 'text-muted-foreground',
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
                      'rounded-md px-3 py-2 text-sm font-semibold uppercase tracking-wide transition-colors hover:bg-accent',
                      pathname.startsWith(link.href) && 'bg-accent',
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
                <hr className="my-2" />
                <p className="px-3 py-1 text-xs font-medium text-muted-foreground">Categories</p>
                {categoryGroups.map((group) => (
                  <Link
                    key={group.slug}
                    href={`/rankings/${group.slug}`}
                    className={cn(
                      'rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
                      activeGroupSlug === group.slug && 'bg-accent font-medium',
                    )}
                  >
                    {group.name}
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
      <div className="border-b">
        <div className="container">
          <nav className="hidden items-center gap-0 overflow-x-auto md:flex">
            {categoryGroups.map((group) => (
              <Link
                key={group.slug}
                href={`/rankings/${group.slug}`}
                className={cn(
                  'whitespace-nowrap border-b-2 px-4 py-2 text-[13px] transition-colors hover:text-foreground',
                  activeGroupSlug === group.slug
                    ? 'border-foreground font-medium text-foreground'
                    : 'border-transparent text-muted-foreground',
                )}
              >
                {group.name}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  )
}
