import { Wine } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

type WelcomeHeroProps = {
  userName?: string
  fairName?: string
}

export async function WelcomeHero({ userName, fairName }: WelcomeHeroProps) {
  const t = await getTranslations('home')
  const tCommon = await getTranslations('common')

  return (
    <div className="w-full bg-gradient-to-br from-primary/5 via-background to-background">
      <div className="mx-auto max-w-lg px-4 py-6 lg:max-w-4xl lg:py-8">
        {/* Logo - mobile only, desktop shows in header */}
        <div className="mb-4 flex items-center gap-2 lg:hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
            <Wine className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold">{tCommon('appName')}</span>
        </div>

        {/* Welcome Message */}
        <h1 className="text-2xl font-bold tracking-tight">
          {userName ? t('welcomeBack', { name: userName }) : t('welcomeDefault')}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {fairName ? t('descriptionWithFair', { fairName }) : t('descriptionDefault')}
        </p>
      </div>
    </div>
  )
}
