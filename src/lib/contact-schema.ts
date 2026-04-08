import { z } from 'zod'

export const contactMessageSchema = z.object({
  email: z.string().trim().email('Please enter a valid email').max(255),
  message: z.string().trim().min(1, 'Message is required').max(5000),
})

export type ContactMessageInput = z.infer<typeof contactMessageSchema>
