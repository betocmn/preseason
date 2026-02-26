import { getTranslations } from 'next-intl/server'
import { SignUpForm } from '~/components/auth/signup-form'
import { Link } from '~/i18n/navigation'

export default async function SignUpPage() {
  const t = await getTranslations('auth')
  const tCommon = await getTranslations('common')

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-coral-muted to-white p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-center text-3xl font-bold text-coral">{tCommon('appName')}</h1>
        <div className="rounded-lg border-t-4 border-coral bg-white p-6 shadow-lg">
          <h2 className="mb-6 text-center text-xl font-semibold">{t('createAccount')}</h2>
          <SignUpForm />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t('hasAccount')}{' '}
            <Link href="/login" className="font-medium text-coral hover:text-coral/80">
              {t('signInLink')}
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
