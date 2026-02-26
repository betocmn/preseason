import Link from 'next/link'
import { Suspense } from 'react'
import { LoginForm } from '~/components/auth/login-form'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-center text-3xl font-bold">Preseason</h1>
        <div className="rounded-lg border bg-card p-6 shadow-lg">
          <h2 className="mb-6 text-center text-xl font-semibold">Sign in</h2>
          <Suspense>
            <LoginForm />
          </Suspense>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {"Don't have an account? "}
            <Link href="/signup" className="font-medium text-primary hover:text-primary/80">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
