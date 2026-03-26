'use client'

import { zodResolver } from '@hookform/resolvers/zod'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Textarea } from '~/components/ui/textarea'
import { slugify } from '~/lib/slug'
import { api } from '~/trpc/react'

const LEVELS = ['beginner', 'intermediate', 'advanced'] as const

const formSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  slug: z.string().min(1, 'Slug is required').max(255),
  level: z.enum(LEVELS),
  description: z.string().max(10000).optional(),
  expectedCategories: z.string().optional(),
  isActive: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

type Prompt = {
  id: string
  title: string
  slug: string
  level: string
  description: string | null
  expectedCategories: string[] | null
  isActive: boolean
}

type PromptFormProps = {
  prompt?: Prompt
}

export function PromptForm({ prompt }: PromptFormProps) {
  const router = useRouter()
  const isEditing = !!prompt

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: prompt?.title ?? '',
      slug: prompt?.slug ?? '',
      level: (prompt?.level as FormValues['level']) ?? 'beginner',
      description: prompt?.description ?? '',
      expectedCategories: prompt?.expectedCategories?.join(', ') ?? '',
      isActive: prompt?.isActive ?? true,
    },
  })

  const createMutation = api.prompt.create.useMutation({
    onSuccess: () => {
      toast.success('Prompt created')
      router.push('/beto-admin/prompts')
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = api.prompt.update.useMutation({
    onSuccess: () => {
      toast.success('Prompt updated')
      router.push('/beto-admin/prompts')
    },
    onError: (err) => toast.error(err.message),
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  function onSubmit(values: FormValues) {
    const description = values.description?.trim() ?? ''
    const expectedCategories = values.expectedCategories
      ? values.expectedCategories
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
      : undefined

    if (isEditing) {
      updateMutation.mutate({
        id: prompt.id,
        title: values.title,
        slug: values.slug,
        level: values.level,
        description: description || null,
        expectedCategories: expectedCategories?.length ? expectedCategories : null,
        isActive: values.isActive,
      })
    } else {
      createMutation.mutate({
        title: values.title,
        slug: values.slug,
        level: values.level,
        description: description || undefined,
        expectedCategories: expectedCategories?.length ? expectedCategories : undefined,
        isActive: values.isActive,
      })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
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
          name="level"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Level</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a level" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          name="expectedCategories"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Expected Categories</FormLabel>
              <FormControl>
                <Input {...field} placeholder="hosting, database, auth, payments" />
              </FormControl>
              <FormDescription>
                Comma-separated subcategory slugs this prompt targets
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

        <div className="flex gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Saving...' : isEditing ? 'Update Prompt' : 'Create Prompt'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/beto-admin/prompts')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
