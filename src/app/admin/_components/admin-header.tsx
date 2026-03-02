'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '~/components/ui/button'
import { auth } from '~/lib/auth-client'

type AdminHeaderProps = {
  displayName: string
}

export function AdminHeader({ displayName }: AdminHeaderProps) {
  const router = useRouter()

  async function handleLogout() {
    await auth.signOut()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6">
      <div className="flex-1" />
      <span className="text-sm text-muted-foreground">{displayName}</span>
      <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout">
        <LogOut className="h-4 w-4" />
      </Button>
    </header>
  )
}
