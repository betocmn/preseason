'use client'

import { Globe, LogOut, Pencil } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { toast } from 'sonner'
import { ProfileEditForm } from '~/components/attendee/profile-edit-form'
import { ProfileView } from '~/components/attendee/profile-view'
import { LanguageSwitcher } from '~/components/language-switcher'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
import { Separator } from '~/components/ui/separator'
import { useRouter } from '~/i18n/navigation'
import { auth } from '~/lib/auth-client'
import { api } from '~/trpc/react'

export default function ProfilePage() {
  const router = useRouter()
  const t = useTranslations('profile')
  const tAuth = useTranslations('auth')
  const tCommon = useTranslations('common')
  const [isEditing, setIsEditing] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const { data: profile, isLoading } = api.user.getProfile.useQuery()

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await auth.signOut()
      router.push('/login')
      router.refresh()
    } catch {
      toast.error(tAuth('errors.signOutFailed'))
      setIsLoggingOut(false)
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4 lg:max-w-2xl">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 animate-pulse rounded-full bg-muted" />
                <div className="space-y-2">
                  <div className="h-5 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                </div>
              </div>
              <div className="space-y-3 pt-2">
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center px-4 text-center">
        <p className="text-muted-foreground">{t('notFound')}</p>
        <Button className="mt-4" onClick={() => router.push('/login')}>
          {t('goToLogin')}
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 lg:max-w-2xl">
      <h1 className="text-2xl font-bold">{t('title')}</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{t('personalInfo')}</CardTitle>
          {!isEditing && (
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="mr-1.5 h-4 w-4" />
              {t('edit')}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <ProfileEditForm
              firstName={profile.firstName}
              lastName={profile.lastName}
              onSuccess={() => setIsEditing(false)}
            />
          ) : (
            <ProfileView
              firstName={profile.firstName}
              lastName={profile.lastName}
              email={profile.email}
              birthDate={profile.birthDate}
              role={profile.role}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('preferences')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{tCommon('language')}</span>
            </div>
            <LanguageSwitcher />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Button
        variant="outline"
        className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={handleLogout}
        disabled={isLoggingOut}
      >
        <LogOut className="mr-2 h-4 w-4" />
        {isLoggingOut ? tAuth('signingOut') : tAuth('signOut')}
      </Button>
    </div>
  )
}
