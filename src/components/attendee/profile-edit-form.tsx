'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslations } from 'next-intl'
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
import { api } from '~/trpc/react'

type UpdateProfileFormData = { firstName: string; lastName: string }

type ProfileEditFormProps = {
  firstName: string
  lastName: string
  onSuccess?: () => void
}

export function ProfileEditForm({ firstName, lastName, onSuccess }: ProfileEditFormProps) {
  const t = useTranslations('profile')
  const tAuth = useTranslations('auth')
  const tCommon = useTranslations('common')
  const utils = api.useUtils()

  const updateProfileSchema = z.object({
    firstName: z.string().min(1, tAuth('validation.firstNameRequired')).max(100),
    lastName: z.string().min(1, tAuth('validation.lastNameRequired')).max(100),
  })

  const updateProfile = api.user.updateProfile.useMutation({
    onSuccess: () => {
      void utils.user.getProfile.invalidate()
      toast.success(t('updateSuccess'))
      onSuccess?.()
    },
    onError: (error) => {
      toast.error(error.message || t('updateError'))
    },
  })

  const form = useForm<UpdateProfileFormData>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      firstName,
      lastName,
    },
  })

  function onSubmit(values: UpdateProfileFormData) {
    updateProfile.mutate(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="firstName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tAuth('firstName')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={tAuth('firstNamePlaceholder')}
                  autoComplete="given-name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="lastName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tAuth('lastName')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={tAuth('lastNamePlaceholder')}
                  autoComplete="family-name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={updateProfile.isPending || !form.formState.isDirty}>
            {updateProfile.isPending ? t('saving') : t('saveChanges')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
            disabled={!form.formState.isDirty}
          >
            {tCommon('cancel')}
          </Button>
        </div>
      </form>
    </Form>
  )
}
