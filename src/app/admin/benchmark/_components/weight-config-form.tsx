'use client'

import { zodResolver } from '@hookform/resolvers/zod'
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
import { Textarea } from '~/components/ui/textarea'
import { api } from '~/trpc/react'
import { loadFreshBenchmarkAdminPage } from './navigation'

const formSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  frontierWeight: z.coerce.number().min(0).max(10),
  midWeight: z.coerce.number().min(0).max(10),
  smallWeight: z.coerce.number().min(0).max(10),
})

type FormValues = z.infer<typeof formSchema>

export function WeightConfigForm() {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      frontierWeight: 1.0,
      midWeight: 1.0,
      smallWeight: 1.0,
    },
  })

  const mutation = api.benchmarkAdmin.createWeightConfig.useMutation({
    onSuccess: () => {
      toast.success('Weight config created')
      loadFreshBenchmarkAdminPage()
    },
    onError: (err) => toast.error(err.message),
  })

  function onSubmit(values: FormValues) {
    mutation.mutate(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Uniform v1" {...field} />
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
                  <Input placeholder="uniform-v1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Textarea {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="frontierWeight"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Frontier Weight</FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="midWeight"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mid Weight</FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="smallWeight"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Small Weight</FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating...' : 'Create Config'}
        </Button>
      </form>
    </Form>
  )
}
