import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
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

const siteDescription = 'Track what tools LLMs recommend for vibe-coding prompts'

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'),
  ),
  title: {
    default: 'Preseason',
    template: '%s | Preseason',
  },
  description: siteDescription,
  openGraph: {
    type: 'website',
    siteName: 'Preseason',
    title: 'Preseason',
    description: siteDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Preseason',
    description: siteDescription,
  },
  icons: {
    icon: [{ url: '/favicon/favicon-96x96.png', sizes: '96x96', type: 'image/png' }],
    shortcut: ['/favicon/favicon.ico'],
    apple: [{ url: '/favicon/apple-touch-icon.png', sizes: '180x180' }],
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
      </body>
    </html>
  )
}
