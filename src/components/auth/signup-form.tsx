'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
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
import { useRouter } from '~/i18n/navigation'
import { auth } from '~/lib/auth-client'
import { api } from '~/trpc/react'

function useSignUpSchemas() {
  const t = useTranslations('auth.validation')
  const profileSchema = z.object({
    firstName: z.string().min(1, t('firstNameRequired')).max(100),
    lastName: z.string().min(1, t('lastNameRequired')).max(100),
    birthDate: z.string().refine(
      (date) => {
        const birth = new Date(date)
        const today = new Date()
        const age = today.getFullYear() - birth.getFullYear()
        const monthDiff = today.getMonth() - birth.getMonth()
        const dayDiff = today.getDate() - birth.getDate()
        const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age
        return actualAge >= 18
      },
      { message: t('ageRestriction') },
    ),
    email: z.string().email(t('emailRequired')),
  })
  const otpSchema = z.object({
    otp: z.string().length(6, t('otpLength')),
  })
  return { profileSchema, otpSchema }
}

function useSignUpErrorMessage() {
  const t = useTranslations('auth.errors')
  return (error: unknown): string => {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      if (message.includes('already registered') || message.includes('already exists')) {
        return t('accountExists')
      }
      if (message.includes('rate limit') || message.includes('too many')) {
        return t('rateLimit')
      }
      if (message.includes('expired')) {
        return t('expired')
      }
      if (message.includes('invalid') || message.includes('otp')) {
        return t('invalidOtp')
      }
      return error.message
    }
    return t('unexpected')
  }
}

function getMaxBirthDate(): string {
  const date = new Date()
  date.setFullYear(date.getFullYear() - 18)
  return date.toISOString().split('T')[0] ?? ''
}

export function SignUpForm() {
  const router = useRouter()
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')
  const { profileSchema, otpSchema } = useSignUpSchemas()
  const getErrorMessage = useSignUpErrorMessage()
  const [step, setStep] = useState<'profile' | 'otp'>('profile')
  const [profileData, setProfileData] = useState<z.infer<typeof profileSchema> | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const createProfile = api.user.createProfile.useMutation()

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      birthDate: '',
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
      toast.success(t('codeSent'))
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
        throw new Error(t('errors.createFailed'))
      }

      await createProfile.mutateAsync({
        id: user.id,
        email: profileData.email,
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        birthDate: profileData.birthDate,
      })

      toast.success(t('signUpSuccess'))
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
          {t('codeSentTo', { email: profileData?.email ?? '' })}
        </p>
        <div className="space-y-2">
          <label htmlFor="otp" className="text-sm font-medium leading-none">
            {t('verificationCode')}
          </label>
          <Input
            id="otp"
            type="text"
            placeholder={t('otpPlaceholder')}
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
        <Button
          type="submit"
          className="w-full bg-coral text-coral-foreground hover:bg-coral/90"
          disabled={isLoading}
        >
          {isLoading ? t('creatingAccount') : t('verifyAndCreate')}
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
          {tCommon('back')}
        </Button>
      </form>
    )
  }

  return (
    <Form {...profileForm}>
      <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
        <FormField
          control={profileForm.control}
          name="firstName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('firstName')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('firstNamePlaceholder')}
                  autoComplete="given-name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={profileForm.control}
          name="lastName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('lastName')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('lastNamePlaceholder')}
                  autoComplete="family-name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={profileForm.control}
          name="birthDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('dateOfBirth')}</FormLabel>
              <FormControl>
                <Input type="date" max={getMaxBirthDate()} autoComplete="bday" {...field} />
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
              <FormLabel>{t('email')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('emailPlaceholder')}
                  type="email"
                  autoComplete="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          className="w-full bg-coral text-coral-foreground hover:bg-coral/90"
          disabled={isLoading}
        >
          {isLoading ? t('sendingCode') : t('continue')}
        </Button>
      </form>
    </Form>
  )
}
