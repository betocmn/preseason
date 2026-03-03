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

export const metadata: Metadata = {
  title: 'Preseason',
  description: 'Track what tools LLMs recommend for vibe-coding prompts',
  icons: {
    icon: [
      { url: '/favicon/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon/favicon.svg', type: 'image/svg+xml' },
    ],
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
