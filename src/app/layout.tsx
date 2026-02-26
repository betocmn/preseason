import type { Metadata } from 'next'
import '~/app/globals.css'

export const metadata: Metadata = {
  title: 'Wine2cents',
  description: 'Wine rating and review platform',
  icons: [{ rel: 'icon', url: '/favicon.ico' }],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
