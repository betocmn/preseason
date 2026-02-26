import type { ReactNode } from 'react'
import { BottomNav } from './bottom-nav'
import { HeaderNav } from './header-nav'

type AttendeeLayoutProps = {
  children: ReactNode
}

export function AttendeeLayout({ children }: AttendeeLayoutProps) {
  return (
    <div className="min-h-screen bg-background pb-20 lg:pb-0">
      {/* Header Navigation - Desktop only */}
      <HeaderNav />

      {/* Main Content */}
      <main>{children}</main>

      {/* Bottom Navigation - Mobile only */}
      <BottomNav />
    </div>
  )
}
