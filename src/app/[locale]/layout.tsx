import { Geist } from 'next/font/google'
import { notFound } from 'next/navigation'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { Toaster } from '~/components/ui/sonner'
import { routing } from '~/i18n/routing'
import { TRPCReactProvider } from '~/trpc/react'

const geist = Geist({
  subsets: ['latin'],
})

type Props = {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const messages = await getMessages()

  return (
    <html lang={locale} className={geist.className} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider messages={messages}>
          <TRPCReactProvider>{children}</TRPCReactProvider>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
