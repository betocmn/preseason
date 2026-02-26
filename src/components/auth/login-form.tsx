'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import { auth } from '~/lib/auth-client'

const emailSchema = z.object({
  email: z.string().email('Please enter a valid email'),
})

const otpSchema = z.object({
  otp: z.string().length(6, 'Code must be 6 digits'),
})

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message.includes('user not found') || message.includes('signups not allowed')) {
      return 'No account found with this email'
    }
    if (message.includes('rate limit') || message.includes('too many')) {
      return 'Too many attempts. Please try again later.'
    }
    if (message.includes('expired')) {
      return 'Code has expired. Please request a new one.'
    }
    if (message.includes('invalid') || message.includes('otp')) {
      return 'Invalid verification code'
    }
    return error.message
  }
  return 'An unexpected error occurred'
}

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<'email' | 'otp'>('email')
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  })

  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '' },
  })

  async function onEmailSubmit(values: z.infer<typeof emailSchema>) {
    setIsLoading(true)
    try {
      await auth.signInWithOtp(values.email)
      setEmail(values.email)
      setStep('otp')
      toast.success('Verification code sent!')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  async function onOtpSubmit(values: z.infer<typeof otpSchema>) {
    setIsLoading(true)
    try {
      await auth.verifyOtp(email, values.otp)
      toast.success('Signed in successfully!')
      const raw = searchParams.get('redirectTo') ?? '/'
      const redirectTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
      router.push(redirectTo)
      router.refresh()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  if (step === 'otp') {
    return (
      <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
        <p className="text-sm text-muted-foreground">We sent a code to {email}</p>
        <div className="space-y-2">
          <label htmlFor="otp" className="text-sm font-medium leading-none">
            Verification code
          </label>
          <Input
            id="otp"
            type="text"
            placeholder="000000"
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otpForm.watch('otp')}
            onChange={(e) => otpForm.setValue('otp', e.target.value)}
          />
          {otpForm.formState.errors.otp && (
            <p className="text-sm font-medium text-destructive">
              {otpForm.formState.errors.otp.message}
            </p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Verifying...' : 'Verify'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            setStep('email')
            otpForm.reset()
          }}
        >
          Back
        </Button>
      </form>
    )
  }

  return (
    <Form {...emailForm}>
      <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
        <FormField
          control={emailForm.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="you@example.com" type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Sending...' : 'Send code'}
        </Button>
      </form>
    </Form>
  )
}
