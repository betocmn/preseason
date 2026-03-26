import Image from 'next/image'
import Link from 'next/link'
import { SignUpForm } from '~/components/auth/signup-form'

export default function SignUpPage() {
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
            />
          </Link>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-lg">
          <h2 className="mb-6 text-center text-xl font-semibold text-card-foreground">
            Create account
          </h2>
          <SignUpForm />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-[#7da1ff] hover:text-[#93b0ff]">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
