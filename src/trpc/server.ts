import 'server-only'

import { headers } from 'next/headers'
import { cache } from 'react'
import { createCaller } from '~/server/api/root'
import { createTRPCContext } from '~/server/api/trpc'
import { db } from '~/server/db'

const createContext = cache(async () => {
  const heads = new Headers(await headers())
  heads.set('x-trpc-source', 'rsc')
  return createTRPCContext({ headers: heads })
})

export const api = cache(async () => createCaller(await createContext()))

// Public RSC callers must avoid request-time APIs or the route becomes dynamic.
export const publicApi = cache(
  async () =>
    createCaller({
      db,
      user: null,
      headers: new Headers([['x-trpc-source', 'rsc-public']]),
    }),
)
