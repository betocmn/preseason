# How Translations Work

Wine2cents uses [next-intl](https://next-intl.dev/) with URL-prefix locale routing (`/en/...`, `/bg/...`).

## Architecture

```
messages/
  en.json          # English strings (source of truth)
  bg.json          # Bulgarian translations
src/i18n/
  routing.ts       # Defines locales: ['en', 'bg'], defaultLocale: 'en'
  request.ts       # Server-side config, loads messages per locale
  navigation.ts    # Locale-aware Link, redirect, useRouter, usePathname
src/middleware.ts   # Combines next-intl locale detection with Supabase auth
src/app/[locale]/   # All pages live under the [locale] route segment
```

## How it works

- Visiting `/` redirects to `/en/` (or the user's preferred locale via cookie)
- The `[locale]` layout loads messages from `messages/{locale}.json` and wraps the app in `NextIntlClientProvider`
- Middleware detects locale from URL, handles redirects, and refreshes Supabase auth sessions

## Using translations in components

### Client components (`'use client'`)

```tsx
import { useTranslations } from 'next-intl'

export function MyComponent() {
  const t = useTranslations('namespace')
  return <h1>{t('key')}</h1>
}
```

### Server components

```tsx
import { getTranslations } from 'next-intl/server'

export default async function MyPage() {
  const t = await getTranslations('namespace')
  return <h1>{t('key')}</h1>
}
```

### Interpolation

```tsx
// Message: "Welcome back, {name}!"
t('welcomeBack', { name: 'John' })
```

### Plurals

```tsx
// Message: "{count} {count, plural, one {wine} other {wines}} found"
t('winesFound', { count: 42 })
```

## Message file structure

Messages are organized by namespace (top-level keys in the JSON):

```json
{
  "common": { "appName": "Wine2cents", "back": "Back", ... },
  "nav": { "home": "Home", "search": "Search", ... },
  "auth": { "signIn": "Sign In", "errors": { "noAccount": "..." }, ... },
  "profile": { ... },
  "home": { ... },
  "search": { "filters": { ... }, "wineTypes": { ... }, ... },
  "favorites": { ... },
  "reviews": { ... },
  "admin": { "nav": { ... }, "dashboard": { ... }, ... }
}
```

## Adding new strings

1. Add the key to `messages/en.json` under the appropriate namespace
2. Add the Bulgarian translation to `messages/bg.json` with the same key
3. Use `useTranslations('namespace')` or `getTranslations('namespace')` in your component
4. Run `pnpm run i18n:verify` to confirm both files have matching keys

## Adding a new namespace

1. Add a new top-level key in both `messages/en.json` and `messages/bg.json`
2. Use `useTranslations('newNamespace')` or `getTranslations('newNamespace')` in components

## Navigation imports

Always use locale-aware navigation from `~/i18n/navigation` instead of `next/link` or `next/navigation`:

| Instead of | Use |
|---|---|
| `import Link from 'next/link'` | `import { Link } from '~/i18n/navigation'` |
| `import { useRouter } from 'next/navigation'` | `import { useRouter } from '~/i18n/navigation'` |
| `import { usePathname } from 'next/navigation'` | `import { usePathname } from '~/i18n/navigation'` |

**Exceptions:** `useSearchParams` and `notFound` still come from `next/navigation`. Server component `redirect` in layouts also uses `next/navigation` (middleware handles the locale prefix).

## Language switcher

The `<LanguageSwitcher />` component (in `src/components/language-switcher.tsx`) is used on the profile page. It calls `router.replace(pathname, { locale: newLocale })` to switch the URL prefix.

## Verification

```bash
pnpm run i18n:verify   # Checks all keys match between en.json and bg.json
```

This script reports any missing or extra keys per locale.
