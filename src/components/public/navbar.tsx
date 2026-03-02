'use client'

import { Menu } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '~/components/public/theme-toggle'
import { Button } from '~/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '~/components/ui/sheet'
import { cn } from '~/lib/utils'

const navLinks = [
  { href: '/matches', label: 'Live Matches' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/critics', label: 'Critics' },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <header className="sticky top-0 z-50 border-b bg-background">
      <div className="container flex h-14 items-center gap-6">
        <Link href="/" className="mr-4 text-lg font-bold tracking-tight">
          Preseason
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
                      'rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent',
                      pathname.startsWith(link.href) && 'bg-accent',
                    )}
                  >
                    {link.label}
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
    </header>
  )
}
