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
import { slugify } from '~/lib/slug'
import { CATALOG_PROVIDER_IDS } from '~/server/llm/catalog'
import { api } from '~/trpc/react'

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  slug: z.string().min(1, 'Slug is required').max(255),
  provider: z.enum(CATALOG_PROVIDER_IDS, {
    required_error: 'Provider is required',
  }),
  company: z.string().min(1, 'Company is required').max(255),
  modelFamily: z.string().min(1, 'Model family is required').max(100),
  modelVersion: z.string().min(1, 'Model version is required').max(100),
  modelId: z.string().min(1, 'Model ID is required').max(255),
  isActive: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

type Llm = {
  id: string
  name: string
  slug: string
  provider: string
  company: string
  modelFamily: string
  modelVersion: string
  modelId: string
  isActive: boolean
}

type LlmFormProps = {
  llm?: Llm
}

export function LlmForm({ llm }: LlmFormProps) {
  const router = useRouter()
  const isEditing = !!llm

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: llm?.name ?? '',
      slug: llm?.slug ?? '',
      provider: (llm?.provider as FormValues['provider']) ?? undefined,
      company: llm?.company ?? '',
      modelFamily: llm?.modelFamily ?? '',
      modelVersion: llm?.modelVersion ?? '',
      modelId: llm?.modelId ?? '',
      isActive: llm?.isActive ?? true,
    },
  })

  const createMutation = api.llm.create.useMutation({
    onSuccess: () => {
      toast.success('LLM created')
      router.push('/admin/llms')
    },
    onError: (err) => toast.error(err.message),
  })

  const updateMutation = api.llm.update.useMutation({
    onSuccess: () => {
      toast.success('LLM updated')
      router.push('/admin/llms')
    },
    onError: (err) => toast.error(err.message),
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  function onSubmit(values: FormValues) {
    if (isEditing) {
      updateMutation.mutate({ id: llm.id, ...values })
    } else {
      createMutation.mutate(values)
    }
  }

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
          name="provider"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a provider" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {CATALOG_PROVIDER_IDS.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
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
          name="company"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. Anthropic" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="modelFamily"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model Family</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. claude" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="modelVersion"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model Version</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. 3.5-sonnet" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="modelId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Model ID</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. anthropic/claude-3.5-sonnet" />
              </FormControl>
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
            {isPending ? 'Saving...' : isEditing ? 'Update LLM' : 'Create LLM'}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push('/admin/llms')}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
