'use client'

import type { ReactNode } from 'react'
import { AdminHeader } from './admin-header'
import { AdminSidebar } from './admin-sidebar'

type AdminLayoutProps = {
  children: ReactNode
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-muted/40">
      {/* Desktop Sidebar - hidden on mobile */}
      <AdminSidebar className="fixed inset-y-0 left-0 z-50 hidden lg:flex" />

      {/* Main Content Area */}
      <div className="lg:pl-64">
        <AdminHeader />
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
