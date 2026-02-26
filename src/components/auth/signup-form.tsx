'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
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
import { api } from '~/trpc/react'

const profileSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(150),
  email: z.string().email('Please enter a valid email'),
})

const otpSchema = z.object({
  otp: z.string().length(6, 'Code must be 6 digits'),
})

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message.includes('already registered') || message.includes('already exists')) {
      return 'An account with this email already exists'
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

export function SignUpForm() {
  const router = useRouter()
  const [step, setStep] = useState<'profile' | 'otp'>('profile')
  const [profileData, setProfileData] = useState<z.infer<typeof profileSchema> | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const createProfile = api.user.createProfile.useMutation()

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: '',
      email: '',
    },
  })

  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '' },
  })

  async function onProfileSubmit(values: z.infer<typeof profileSchema>) {
    setIsLoading(true)
    try {
      await auth.signUpWithOtp(values.email)
      setProfileData(values)
      setStep('otp')
      toast.success('Verification code sent!')
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsLoading(false)
    }
  }

  async function onOtpSubmit(values: z.infer<typeof otpSchema>) {
    if (!profileData) return

    setIsLoading(true)
    try {
      const { user } = await auth.verifyOtp(profileData.email, values.otp)

      if (!user) {
        throw new Error('Failed to create account')
      }

      await createProfile.mutateAsync({
        id: user.id,
        email: profileData.email,
        displayName: profileData.displayName,
      })

      toast.success('Account created successfully!')
      router.push('/')
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
        <p className="text-sm text-muted-foreground">
          We sent a code to {profileData?.email ?? ''}
        </p>
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
          {isLoading ? 'Creating account...' : 'Verify & create account'}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            setStep('profile')
            otpForm.reset()
          }}
        >
          Back
        </Button>
      </form>
    )
  }

  return (
    <Form {...profileForm}>
      <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
        <FormField
          control={profileForm.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display name</FormLabel>
              <FormControl>
                <Input placeholder="Your name" autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={profileForm.control}
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
          {isLoading ? 'Sending code...' : 'Continue'}
        </Button>
      </form>
    </Form>
  )
}
