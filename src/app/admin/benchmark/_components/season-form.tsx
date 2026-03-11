'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Textarea } from '~/components/ui/textarea'
import { api } from '~/trpc/react'

const formSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100),
  protocolId: z.string().uuid(),
  notes: z.string().max(5000).optional(),
})

type FormValues = z.infer<typeof formSchema>

type Protocol = {
  id: string
  slug: string
  name: string
  mode: string
}

export function SeasonForm({ protocols }: { protocols: Protocol[] }) {
  const router = useRouter()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      slug: '',
      protocolId: protocols[0]?.id ?? '',
      notes: '',
    },
  })

  const createMutation = api.benchmarkAdmin.createSeason.useMutation({
    onSuccess: () => {
      toast.success('Season created')
      router.push('/beto-admin/benchmark')
    },
    onError: (err) => toast.error(err.message),
  })

  function onSubmit(values: FormValues) {
    createMutation.mutate(values)
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
                <Input placeholder="Season 1" {...field} />
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
                <Input placeholder="season-1" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="protocolId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Protocol</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a protocol" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {protocols.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.slug})
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
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Textarea placeholder="Season notes..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3">
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating...' : 'Create Season'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/beto-admin/benchmark')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
