'use client'

import { Heart, Home, Search, Star, User } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link, usePathname } from '~/i18n/navigation'
import { cn } from '~/lib/utils'

const navItems = [
  { href: '/', labelKey: 'home', icon: Home },
  { href: '/search', labelKey: 'search', icon: Search },
  { href: '/reviews', labelKey: 'myReviews', icon: Star },
  { href: '/favorites', labelKey: 'myFavorites', icon: Heart },
  { href: '/profile', labelKey: 'profile', icon: User },
] as const

export function BottomNav() {
  const pathname = usePathname()
  const t = useTranslations('nav')

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-coral/30 bg-coral text-coral-foreground shadow-[0_-6px_18px_rgba(0,0,0,0.12)] lg:hidden">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'text-coral-foreground'
                  : 'text-coral-foreground/75 hover:text-coral-foreground',
              )}
            >
              <item.icon
                className={cn(
                  'h-5 w-5 transition-transform',
                  isActive ? 'scale-110 drop-shadow' : 'text-current',
                )}
              />
              <span className="font-medium">{t(item.labelKey)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
