import { getTranslations } from 'next-intl/server'
import { LoginForm } from '~/components/auth/login-form'
import { Link } from '~/i18n/navigation'

export default async function LoginPage() {
  const t = await getTranslations('auth')
  const tCommon = await getTranslations('common')

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-coral-muted to-white p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-center text-3xl font-bold text-coral">{tCommon('appName')}</h1>
        <div className="rounded-lg border-t-4 border-coral bg-white p-6 shadow-lg">
          <h2 className="mb-6 text-center text-xl font-semibold">{t('signIn')}</h2>
          <LoginForm />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t('noAccount')}{' '}
            <Link href="/signup" className="font-medium text-coral hover:text-coral/80">
              {t('signUp')}
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
