'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { usePathname, useRouter } from '~/i18n/navigation'
import type { Locale } from '~/i18n/routing'

const LANGUAGE_OPTIONS: { value: Locale; labelKey: string; flag: string }[] = [
  { value: 'en', labelKey: 'en', flag: '🇬🇧' },
  { value: 'bg', labelKey: 'bg', flag: '🇧🇬' },
]

export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale() as Locale
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('common.languages')

  const currentOption = LANGUAGE_OPTIONS.find((o) => o.value === locale)

  function handleLanguageChange(newLocale: string) {
    if (newLocale === locale) return
    router.replace(pathname, { locale: newLocale as Locale })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={className}>
          <span className="text-base leading-none">{currentOption?.flag}</span>
          <span className="ml-1.5 text-xs font-medium uppercase">{locale}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={locale} onValueChange={handleLanguageChange}>
          {LANGUAGE_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span className="mr-2 text-base leading-none">{option.flag}</span>
              {t(option.labelKey)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
