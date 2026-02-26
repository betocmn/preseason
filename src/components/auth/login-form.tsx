'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useSearchParams } from 'next/navigation'
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

function useAuthSchemas() {
  const t = useTranslations('auth.validation')
  const emailSchema = z.object({
    email: z.string().email(t('emailRequired')),
  })
  const otpSchema = z.object({
    otp: z.string().length(6, t('otpLength')),
  })
  return { emailSchema, otpSchema }
}

function useErrorMessage() {
  const t = useTranslations('auth.errors')
  return (error: unknown): string => {
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      if (message.includes('user not found') || message.includes('signups not allowed')) {
        return t('noAccount')
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

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')
  const { emailSchema, otpSchema } = useAuthSchemas()
  const getErrorMessage = useErrorMessage()
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
      toast.success(t('codeSent'))
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
      toast.success(t('signInSuccess'))
      const redirectTo = searchParams.get('redirectTo') ?? '/'
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
        <p className="text-sm text-muted-foreground">{t('codeSentTo', { email })}</p>
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
          {isLoading ? t('verifying') : t('verify')}
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
          {tCommon('back')}
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
          {isLoading ? t('sending') : t('sendCode')}
        </Button>
      </form>
    </Form>
  )
}
