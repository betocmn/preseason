'use client'

import { Menu } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '~/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '~/components/ui/sheet'
import { cn } from '~/lib/utils'

const navLinks = [
  { href: '/matches', label: 'Head-to-Head' },
  { href: '/rankings', label: 'Rankings' },
  { href: '/critics', label: 'Critics' },
  { href: '/prompts', label: 'Prompts' },
  { href: '/methodology', label: 'Methodology' },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-64">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
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
  )
}
