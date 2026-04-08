'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
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
import { type ContactMessageInput, contactMessageSchema } from '~/lib/contact-schema'
import { api } from '~/trpc/react'

export function ContactForm() {
  const form = useForm<ContactMessageInput>({
    resolver: zodResolver(contactMessageSchema),
    defaultValues: { email: '', message: '' },
  })

  const createMessage = api.contact.create.useMutation({
    onSuccess: () => {
      toast.success('Message sent! We will get back to you soon.')
      form.reset()
    },
    onError: (error) => {
      toast.error(error.message ?? 'Something went wrong. Please try again.')
    },
  })

  function onSubmit(values: ContactMessageInput) {
    createMessage.mutate(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Message</FormLabel>
              <FormControl>
                <Textarea placeholder="What's on your mind?" rows={5} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={createMessage.isPending}>
          {createMessage.isPending ? 'Sending…' : 'Send message'}
        </Button>
      </form>
    </Form>
  )
}
