import { createHash } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { and, eq, gte, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { serverSettings } from '~/constants/server-settings'
import { env } from '~/env'
import type { ContactMessageInput } from '~/lib/contact-schema'
import type * as schema from '~/server/db/schema'
import { contactMessages } from '~/server/db/schema'

type Database = PostgresJsDatabase<typeof schema>

const LOCALHOST_IP = '127.0.0.1'

function normalizeHeaderIp(value: string | null) {
  const [firstValue] = value?.split(',') ?? []
  const normalized = firstValue?.trim()
  return normalized && normalized.length > 0 ? normalized : null
}

function resolveContactRequestIp(headers: Headers) {
  const ip =
    normalizeHeaderIp(headers.get('x-forwarded-for')) ??
    normalizeHeaderIp(headers.get('x-real-ip')) ??
    normalizeHeaderIp(headers.get('cf-connecting-ip'))

  if (ip) {
    return ip
  }

  if (env.NODE_ENV === 'production') {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unable to process this request right now. Please try again later.',
    })
  }

  return LOCALHOST_IP
}

function hashIpAddress(ip: string) {
  return createHash('sha256').update(ip).digest('hex')
}

export async function createRateLimitedContactMessage(
  db: Database,
  headers: Headers,
  input: ContactMessageInput,
  now = new Date(),
) {
  const sourceIpHash = hashIpAddress(resolveContactRequestIp(headers))
  const windowStart = new Date(now.getTime() - serverSettings.contact.rateLimitWindowMs)

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${serverSettings.contact.advisoryLockNamespace}, hashtext(${sourceIpHash}))`,
    )

    const recentRows = await tx
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(contactMessages)
      .where(
        and(
          eq(contactMessages.sourceIpHash, sourceIpHash),
          gte(contactMessages.createdAt, windowStart),
        ),
      )

    if ((recentRows[0]?.count ?? 0) >= serverSettings.contact.maxSubmissionsPerIp) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many messages. Please try again later.',
      })
    }

    await tx.insert(contactMessages).values({
      email: input.email,
      message: input.message,
      sourceIpHash,
    })
  })
}
