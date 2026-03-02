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
import { api } from '~/trpc/react'

const formSchema = z
  .object({
    toolAId: z.string().uuid('Select Tool A'),
    toolBId: z.string().uuid('Select Tool B'),
    categoryId: z.string().uuid('Select a category'),
    periodStart: z.string().min(1, 'Start date is required'),
    periodEnd: z.string().optional(),
  })
  .refine((data) => data.toolAId !== data.toolBId, {
    message: 'Tools must be different',
    path: ['toolBId'],
  })

type FormValues = z.infer<typeof formSchema>

export default function NewMatchPage() {
  const router = useRouter()

  const { data: toolsData } = api.tool.list.useQuery({ limit: 100 })
  const { data: categories } = api.category.list.useQuery({})

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      toolAId: '',
      toolBId: '',
      categoryId: '',
      periodStart: new Date().toISOString().slice(0, 10),
      periodEnd: '',
    },
  })

  const createMutation = api.match.create.useMutation({
    onSuccess: () => {
      toast.success('Match created')
      router.push('/beto-admin/matches')
    },
    onError: (err) => toast.error(err.message),
  })

  function onSubmit(values: FormValues) {
    createMutation.mutate({
      toolAId: values.toolAId,
      toolBId: values.toolBId,
      categoryId: values.categoryId,
      periodStart: new Date(values.periodStart),
      periodEnd: values.periodEnd ? new Date(values.periodEnd) : undefined,
    })
  }

  const tools = toolsData?.items ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">New Match</h1>
        <p className="text-muted-foreground">Schedule a new match between two tools.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
          <FormField
            control={form.control}
            name="toolAId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tool A</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a tool" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {tools.map((tool) => (
                      <SelectItem key={tool.id} value={tool.id}>
                        {tool.name}
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
            name="toolBId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tool B</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a tool" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {tools.map((tool) => (
                      <SelectItem key={tool.id} value={tool.id}>
                        {tool.name}
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
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(categories ?? []).map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
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
            name="periodStart"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Period Start</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="periodEnd"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Period End (optional)</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex gap-3">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Match'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/beto-admin/matches')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
}
