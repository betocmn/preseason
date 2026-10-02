import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import { Analytics } from '~/components/analytics'
import { Toaster } from '~/components/ui/sonner'
import { TRPCReactProvider } from '~/trpc/react'
import '~/app/globals.css'

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

const siteDescription =
  'The devtools AI chooses. Explore rankings of the tools Claude, GPT, Gemini, DeepSeek and other LLMs recommend when building apps.'

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  ),
  title: {
    default: 'Preseason — The devtools AI chooses',
    template: '%s | Preseason',
  },
  description: siteDescription,
  openGraph: {
    type: 'website',
    siteName: 'Preseason',
    title: 'Preseason — The devtools AI chooses',
    description: siteDescription,
    images: [
      {
        url: '/opengraph-image',
        width: 600,
        height: 600,
        alt: 'Preseason — The devtools AI chooses.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Preseason — The devtools AI chooses',
    description: siteDescription,
    images: [
      {
        url: '/twitter-image',
        width: 1200,
        height: 630,
        alt: 'Preseason — LLM recommendations, ranked.',
      },
    ],
  },
  icons: {
    icon: [
      { url: '/favicon/favicon.svg?v=2', sizes: 'any', type: 'image/svg+xml' },
      { url: '/favicon/favicon-96x96.png?v=2', sizes: '96x96', type: 'image/png' },
    ],
    shortcut: ['/favicon/favicon.ico?v=2'],
    apple: [{ url: '/favicon/apple-touch-icon.png?v=2', sizes: '180x180' }],
  },
  manifest: '/favicon/site.webmanifest',
  appleWebApp: {
    title: 'Preseason',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${geistMono.variable} ${geist.className}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <TRPCReactProvider>{children}</TRPCReactProvider>
          <Toaster />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
