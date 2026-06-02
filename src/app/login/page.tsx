import Image from 'next/image'
import Link from 'next/link'
import { Suspense } from 'react'
import { LoginForm } from '~/components/auth/login-form'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link href="/">
            <Image
              src="/preseason-brand/preseason-logo.svg"
              alt="Preseason"
              width={160}
              height={37}
              priority
              unoptimized
            />
          </Link>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-lg">
          <h2 className="mb-6 text-center text-xl font-semibold text-card-foreground">Sign in</h2>
          <Suspense>
            <LoginForm />
          </Suspense>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {"Don't have an account? "}
            <Link href="/signup" className="font-medium text-[#7da1ff] hover:text-[#93b0ff]">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
