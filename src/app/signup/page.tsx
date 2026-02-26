import Link from 'next/link'
import { SignUpForm } from '~/components/auth/signup-form'

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-center text-3xl font-bold">Preseason</h1>
        <div className="rounded-lg border bg-card p-6 shadow-lg">
          <h2 className="mb-6 text-center text-xl font-semibold">Create account</h2>
          <SignUpForm />
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-primary hover:text-primary/80">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
