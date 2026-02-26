'use client'

import { Heart, Home, Search, Star, User, Wine } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LanguageSwitcher } from '~/components/language-switcher'
import { Link, usePathname } from '~/i18n/navigation'
import { cn } from '~/lib/utils'

const navItems = [
  { href: '/', labelKey: 'home', icon: Home },
  { href: '/search', labelKey: 'search', icon: Search },
  { href: '/reviews', labelKey: 'myReviews', icon: Star },
  { href: '/favorites', labelKey: 'myFavorites', icon: Heart },
  { href: '/profile', labelKey: 'profile', icon: User },
] as const

export function HeaderNav() {
  const pathname = usePathname()
  const t = useTranslations('nav')

  return (
    <header className="sticky top-0 z-50 hidden border-b border-coral/30 bg-coral text-coral-foreground shadow-sm lg:block">
      <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 text-coral-foreground">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            <Wine className="h-4 w-4 text-coral-foreground" />
          </div>
          <span className="text-lg font-bold">Wine2cents</span>
        </Link>

        {/* Nav Items */}
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white/20 text-coral-foreground'
                    : 'text-coral-foreground/80 hover:bg-white/10 hover:text-coral-foreground',
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{t(item.labelKey)}</span>
              </Link>
            )
          })}
          <LanguageSwitcher className="ml-2 text-coral-foreground/80 hover:bg-white/10 hover:text-coral-foreground" />
        </nav>
      </div>
    </header>
  )
}
