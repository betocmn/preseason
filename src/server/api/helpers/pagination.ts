import { z } from 'zod'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

export const paginationInputSchema = z.object({
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.number().int().min(0).default(0),
})

export function normalizePagination(input?: { limit?: number; offset?: number }) {
  return {
    limit: input?.limit ?? DEFAULT_PAGE_SIZE,
    offset: input?.offset ?? 0,
  }
}
