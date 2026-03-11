'use client'

import { FlaskConical, Swords, UserCheck, Wrench } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '~/lib/utils'

const navItems = [
  { href: '/beto-admin/tools', label: 'Tools', icon: Wrench },
  { href: '/beto-admin/critics', label: 'Critics', icon: UserCheck },
  { href: '/beto-admin/matches', label: 'Matches', icon: Swords },
  { href: '/beto-admin/benchmark', label: 'Benchmark', icon: FlaskConical },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 space-y-1 p-4">
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
              isActive
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
