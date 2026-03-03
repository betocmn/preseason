'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '~/components/ui/form'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { api } from '~/trpc/react'

const formSchema = z.object({
  displayName: z.string().min(1, 'Name is required').max(150),
  email: z.string().email('Valid email required').max(255),
  avatarUrl: z
    .string()
    .max(512)
    .refine((value) => value.length === 0 || value.startsWith('/'), {
      message: 'Avatar path must start with "/"',
    })
    .optional(),
  bio: z.string().max(5000).optional(),
  company: z.string().max(255).optional(),
  website: z.string().max(255).optional(),
  title: z.string().max(255).optional(),
  expertiseAreas: z.string().optional(),
  excludedCategories: z.string().optional(),
  isActive: z.boolean(),
  verified: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

type Critic = {
  id: string
  title: string | null
  expertiseAreas: string[] | null
  excludedCategories: string[] | null
  isActive: boolean
  verifiedAt: Date | null
  user: {
    id: string
    email: string
    displayName: string
    avatarUrl: string | null
    bio: string | null
    company: string | null
    website: string | null
  }
}

type CriticFormProps = {
  critic?: Critic
}

function isLocalAvatarPath(value: string) {
  return value.startsWith('/')
}

export function CriticForm({ critic }: CriticFormProps) {
  const router = useRouter()
  const isEditing = !!critic

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      displayName: critic?.user.displayName ?? '',
      email: critic?.user.email ?? '',
      avatarUrl: critic?.user.avatarUrl ?? '',
      bio: critic?.user.bio ?? '',
      company: critic?.user.company ?? '',
      website: critic?.user.website ?? '',
      title: critic?.title ?? '',
      expertiseAreas: critic?.expertiseAreas?.join(', ') ?? '',
      excludedCategories: critic?.excludedCategories?.join(', ') ?? '',
      isActive: critic?.isActive ?? true,
      verified: !!critic?.verifiedAt,
    },
  })

  const avatarUrl = form.watch('avatarUrl')

  const createMutation = api.critic.adminCreate.useMutation({
    onSuccess: () => {
      toast.success('Critic created')
      router.push('/beto-admin/critics')
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = api.critic.adminUpdate.useMutation({
    onSuccess: () => {
      toast.success('Critic updated')
      router.push('/beto-admin/critics')
    },
    onError: (err) => toast.error(err.message),
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  function parseCommaSeparated(value: string | undefined): string[] | undefined {
    if (!value) return undefined
    const items = value
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean)
    return items.length > 0 ? items : undefined
  }

  function onSubmit(values: FormValues) {
    const avatarUrl = values.avatarUrl?.trim() ?? ''
    const bio = values.bio?.trim() ?? ''
    const company = values.company?.trim() ?? ''
    const website = values.website?.trim() ?? ''
    const title = values.title?.trim() ?? ''

    const expertiseAreas = parseCommaSeparated(values.expertiseAreas)
    const excludedCategories = parseCommaSeparated(values.excludedCategories)

    if (isEditing) {
      updateMutation.mutate({
        id: critic.id,
        displayName: values.displayName,
        avatarUrl: avatarUrl || null,
        bio: bio || null,
        company: company || null,
        website: website || null,
        title: title || null,
        expertiseAreas: expertiseAreas ?? null,
        excludedCategories: excludedCategories ?? null,
        isActive: values.isActive,
        verified: values.verified,
      })
    } else {
      createMutation.mutate({
        displayName: values.displayName,
        email: values.email,
        avatarUrl: avatarUrl || undefined,
        bio: bio || undefined,
        company: company || undefined,
        website: website || undefined,
        title: title || undefined,
        expertiseAreas,
        excludedCategories,
        isActive: values.isActive,
        verified: values.verified,
      })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} type="email" disabled={isEditing} />
              </FormControl>
              {isEditing && (
                <FormDescription>Email cannot be changed after creation</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="avatarUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Avatar Path</FormLabel>
              <FormControl>
                <Input {...field} placeholder="/critics/name.png" />
              </FormControl>
              <FormDescription>Path relative to the public folder</FormDescription>
              {avatarUrl && isLocalAvatarPath(avatarUrl) && (
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border bg-background">
                    <Image
                      src={avatarUrl}
                      alt="Avatar preview"
                      width={40}
                      height={40}
                      className="object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">Preview</span>
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} placeholder="VP of Engineering" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="company"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bio</FormLabel>
              <FormControl>
                <Textarea {...field} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="website"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website</FormLabel>
              <FormControl>
                <Input {...field} placeholder="https://example.com" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="expertiseAreas"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Expertise Areas</FormLabel>
              <FormControl>
                <Input {...field} placeholder="infrastructure, scalability, databases" />
              </FormControl>
              <FormDescription>Comma-separated expertise tags</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="excludedCategories"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Excluded Categories</FormLabel>
              <FormControl>
                <Input {...field} placeholder="payments, analytics" />
              </FormControl>
              <FormDescription>
                Comma-separated categories the critic cannot comment on
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-3 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="font-normal">Active</FormLabel>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="verified"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-3 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="font-normal">Verified</FormLabel>
            </FormItem>
          )}
        />

        <div className="flex gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving...' : isEditing ? 'Update Critic' : 'Create Critic'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/beto-admin/critics')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
