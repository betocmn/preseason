'use client'

import { Brain, FlaskConical, MessageSquare, Scale, UserCheck, Wrench } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '~/lib/utils'

export const adminNavItems = [
  { href: '/admin/tools', label: 'Tools', icon: Wrench },
  { href: '/admin/llms', label: 'LLMs', icon: Brain },
  { href: '/admin/prompts', label: 'Prompts', icon: MessageSquare },
  { href: '/admin/critics', label: 'Critics', icon: UserCheck },
  { href: '/admin/benchmark', label: 'Benchmark', icon: FlaskConical },
  { href: '/admin/matches', label: 'Matches', icon: Scale },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 space-y-1 p-4">
      {adminNavItems.map((item) => {
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
