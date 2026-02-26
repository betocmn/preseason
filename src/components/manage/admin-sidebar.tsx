'use client'

import { CalendarDays, Factory, UserCheck, Wine } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '~/i18n/navigation'
import { cn } from '~/lib/utils'

const navItems = [
  { href: '/manage/fairs', labelKey: 'wineFairs' as const, icon: CalendarDays },
  { href: '/manage/attendees', labelKey: 'attendees' as const, icon: UserCheck },
  { href: '/manage/wines', labelKey: 'wines' as const, icon: Wine },
  { href: '/manage/producers', labelKey: 'producers' as const, icon: Factory },
]

type AdminSidebarProps = {
  className?: string
  onNavClick?: () => void
}

export function AdminSidebar({ className, onNavClick }: AdminSidebarProps) {
  const pathname = usePathname()
  const t = useTranslations('admin.nav')
  const tCommon = useTranslations('common')

  return (
    <aside className={cn('flex w-64 flex-col border-r bg-background', className)}>
      {/* Logo/Brand */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/manage" className="flex items-center gap-2">
          <Wine className="h-6 w-6 text-primary" />
          <span className="text-xl font-semibold">{tCommon('appName')}</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <item.icon className="h-4 w-4" />
              {t(item.labelKey)}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
