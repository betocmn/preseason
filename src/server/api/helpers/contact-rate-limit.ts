import { createHash } from 'node:crypto'
import { TRPCError } from '@trpc/server'
import { and, eq, gte, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { serverSettings } from '~/constants/server-settings'
import type { ContactMessageInput } from '~/lib/contact-schema'
import type * as schema from '~/server/db/schema'
import { contactMessages } from '~/server/db/schema'

type Database = PostgresJsDatabase<typeof schema>

const UNKNOWN_CLIENT_KEY = 'unknown-client'

function normalizeSingleHeaderValue(value: string | null) {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : null
}

function normalizeForwardedForIp(value: string | null) {
  const forwardedHops =
    value
      ?.split(',')
      .map((hop) => hop.trim())
      .filter((hop) => hop.length > 0) ?? []

  return forwardedHops.at(-1) ?? null
}

function buildFallbackClientKey(headers: Headers) {
  const fingerprintParts = [
    normalizeSingleHeaderValue(headers.get('user-agent')),
    normalizeSingleHeaderValue(headers.get('accept-language')),
    normalizeSingleHeaderValue(headers.get('host')),
  ].filter((part): part is string => part !== null)

  if (fingerprintParts.length === 0) {
    return UNKNOWN_CLIENT_KEY
  }

  return `header-fallback:${fingerprintParts.join('|')}`
}

function resolveContactRequestClientKey(headers: Headers) {
  return (
    normalizeSingleHeaderValue(headers.get('cf-connecting-ip')) ??
    normalizeSingleHeaderValue(headers.get('x-real-ip')) ??
    normalizeForwardedForIp(headers.get('x-forwarded-for')) ??
    buildFallbackClientKey(headers)
  )
}

function hashClientKey(clientKey: string) {
  return createHash('sha256').update(clientKey).digest('hex')
}

export async function createRateLimitedContactMessage(
  db: Database,
  headers: Headers,
  input: ContactMessageInput,
  now = new Date(),
) {
  const sourceIpHash = hashClientKey(resolveContactRequestClientKey(headers))
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
