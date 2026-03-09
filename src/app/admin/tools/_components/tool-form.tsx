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
import { slugify } from '~/lib/slug'
import { api } from '~/trpc/react'

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  slug: z.string().min(1, 'Slug is required').max(255),
  description: z.string().max(5000).optional(),
  website: z.string().max(512).optional(),
  logoUrl: z
    .string()
    .max(512)
    .refine((value) => value.length === 0 || value.startsWith('/'), {
      message: 'Logo path must start with "/"',
    })
    .optional(),
  aliases: z.string().optional(),
  isVerified: z.boolean(),
  subcategoryIds: z.array(z.string().uuid()),
})

type FormValues = z.infer<typeof formSchema>

type Subcategory = {
  id: string
  name: string
  categoryGroup: { name: string } | null
}

type Tool = {
  id: string
  name: string
  slug: string
  description: string | null
  website: string | null
  logoUrl: string | null
  isVerified: boolean
  aliases: string[] | null
  toolCategories: { categoryId: string }[]
}

type ToolFormProps = {
  tool?: Tool
  subcategories: Subcategory[]
}

function isLocalLogoPath(value: string) {
  return value.startsWith('/')
}

export function ToolForm({ tool, subcategories }: ToolFormProps) {
  const router = useRouter()
  const isEditing = !!tool

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: tool?.name ?? '',
      slug: tool?.slug ?? '',
      description: tool?.description ?? '',
      website: tool?.website ?? '',
      logoUrl: tool?.logoUrl ?? '',
      aliases: tool?.aliases?.join(', ') ?? '',
      isVerified: tool?.isVerified ?? false,
      subcategoryIds: tool?.toolCategories.map((tc) => tc.categoryId) ?? [],
    },
  })

  const logoUrl = form.watch('logoUrl')

  const createMutation = api.tool.create.useMutation({
    onSuccess: () => {
      toast.success('Tool created')
      router.push('/beto-admin/tools')
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = api.tool.update.useMutation({
    onSuccess: () => {
      toast.success('Tool updated')
      router.push('/beto-admin/tools')
    },
    onError: (err) => toast.error(err.message),
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  function onSubmit(values: FormValues) {
    const description = values.description?.trim() ?? ''
    const website = values.website?.trim() ?? ''
    const logoUrl = values.logoUrl?.trim() ?? ''

    const aliases = values.aliases
      ? values.aliases
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean)
      : undefined

    if (isEditing) {
      updateMutation.mutate({
        id: tool.id,
        name: values.name,
        slug: values.slug,
        description: description || null,
        website: website || null,
        logoUrl: logoUrl || null,
        aliases: aliases?.length ? aliases : null,
        categoryIds: values.subcategoryIds,
        isVerified: values.isVerified,
      })
    } else {
      createMutation.mutate({
        name: values.name,
        slug: values.slug,
        description: description || undefined,
        website: website || undefined,
        logoUrl: logoUrl || undefined,
        aliases: aliases?.length ? aliases : undefined,
        categoryIds: values.subcategoryIds.length > 0 ? values.subcategoryIds : undefined,
        isVerified: values.isVerified,
      })
    }
  }

  const groupedSubcategories = subcategories.reduce<Record<string, Subcategory[]>>((acc, sub) => {
    const group = sub.categoryGroup?.name ?? 'Other'
    if (!acc[group]) acc[group] = []
    acc[group].push(sub)
    return acc
  }, {})

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={(e) => {
                    field.onChange(e)
                    if (!isEditing) {
                      form.setValue('slug', slugify(e.target.value))
                    }
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
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
          name="logoUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Logo Path</FormLabel>
              <FormControl>
                <Input {...field} placeholder="/logos/tool-name.png" />
              </FormControl>
              <FormDescription>Path relative to the public folder</FormDescription>
              {logoUrl && isLocalLogoPath(logoUrl) && (
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border bg-background">
                    <Image
                      src={logoUrl}
                      alt="Logo preview"
                      width={32}
                      height={32}
                      className="object-contain"
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
          name="aliases"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Aliases</FormLabel>
              <FormControl>
                <Input {...field} placeholder="alias1, alias2, alias3" />
              </FormControl>
              <FormDescription>Comma-separated alternative names</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isVerified"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-3 space-y-0">
              <FormControl>
                <Checkbox checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <FormLabel className="font-normal">Verified</FormLabel>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="subcategoryIds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sub-categories</FormLabel>
              <FormDescription>Grouped by parent category</FormDescription>
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border p-3">
                {Object.entries(groupedSubcategories).map(([group, subs]) => (
                  <div key={group}>
                    <p className="mb-1 text-xs font-semibold text-muted-foreground">{group}</p>
                    <div className="space-y-1">
                      {subs.map((sub) => (
                        <div key={sub.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            id={`sub-${sub.id}`}
                            checked={field.value.includes(sub.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                field.onChange([...field.value, sub.id])
                              } else {
                                field.onChange(field.value.filter((id) => id !== sub.id))
                              }
                            }}
                          />
                          <label htmlFor={`sub-${sub.id}`}>{sub.name}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving...' : isEditing ? 'Update Tool' : 'Create Tool'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/beto-admin/tools')}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
