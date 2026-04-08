import { createHash } from 'node:crypto'
import type { TRPCError } from '@trpc/server'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { serverSettings } from '~/constants/server-settings'
import { createCaller } from '~/server/api/root'
import { contactMessages } from '~/server/db/schema'
import {
  cleanTestDatabase,
  createTestDatabaseClient,
  getTestDb,
  setupTestDatabase,
  teardownTestDatabase,
} from '~/test/db'

function createContactCaller(ip: string, db = getTestDb()) {
  return createCaller({
    db,
    user: null,
    headers: new Headers({
      'x-forwarded-for': ip,
    }),
  })
}

function buildInput(index: number) {
  return {
    email: `contact-${index}@example.com`,
    message: `Contact message ${index}`,
  }
}

async function countContactMessages(db = getTestDb()) {
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(contactMessages)

  return rows[0]?.count ?? 0
}

describe('contactRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('creates a message when the request is below the per-ip limit', async () => {
    const result = await createContactCaller('198.51.100.10').contact.create(buildInput(1))

    expect(result).toEqual({ success: true })
    expect(await countContactMessages()).toBe(1)
  })

  it('stores a hashed source ip instead of the raw client ip', async () => {
    const ip = '198.51.100.23'

    await createContactCaller(ip).contact.create(buildInput(1))

    const rows = await getTestDb().select().from(contactMessages)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.sourceIpHash).toBe(createHash('sha256').update(ip).digest('hex'))
    expect(rows[0]?.sourceIpHash).not.toBe(ip)
  })

  it('rejects whitespace-only messages without inserting a row', async () => {
    const caller = createContactCaller('198.51.100.24')

    await expect(
      caller.contact.create({
        email: 'contact@example.com',
        message: '   ',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    } satisfies Partial<TRPCError>)

    expect(await countContactMessages()).toBe(0)
  })

  it('rejects the fourth sequential submission from the same ip within the rate-limit window', async () => {
    const caller = createContactCaller('198.51.100.30')

    await caller.contact.create(buildInput(1))
    await caller.contact.create(buildInput(2))
    await caller.contact.create(buildInput(3))

    await expect(caller.contact.create(buildInput(4))).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    } satisfies Partial<TRPCError>)

    expect(await countContactMessages()).toBe(3)
  })

  it('rejects one concurrent submission when the same ip bursts past the limit', async () => {
    const concurrentDb = createTestDatabaseClient({ max: 4 })

    try {
      const submissions = Array.from({ length: 4 }, (_, index) =>
        createContactCaller('198.51.100.40', concurrentDb).contact.create(buildInput(index + 1)),
      )

      const results = await Promise.allSettled(submissions)
      const fulfilled = results.filter((result) => result.status === 'fulfilled')
      const rejected = results.filter((result) => result.status === 'rejected')

      expect(fulfilled).toHaveLength(3)
      expect(rejected).toHaveLength(1)

      const rejectedResult = rejected[0]
      if (!rejectedResult || rejectedResult.status !== 'rejected') {
        throw new Error('Expected one concurrent submission to be rejected')
      }

      expect(rejectedResult.reason).toMatchObject({
        code: 'TOO_MANY_REQUESTS',
      } satisfies Partial<TRPCError>)
      expect(await countContactMessages(concurrentDb)).toBe(3)
    } finally {
      await concurrentDb.$client.end()
    }
  })

  it('ignores rows outside the throttling window', async () => {
    const db = getTestDb()
    const ip = '198.51.100.50'
    const sourceIpHash = createHash('sha256').update(ip).digest('hex')
    const staleCreatedAt = new Date(
      Date.now() - serverSettings.contact.rateLimitWindowMs - 5 * 60 * 1000,
    )

    await db.insert(contactMessages).values([
      {
        email: 'stale-1@example.com',
        message: 'Stale message 1',
        sourceIpHash,
        createdAt: staleCreatedAt,
      },
      {
        email: 'stale-2@example.com',
        message: 'Stale message 2',
        sourceIpHash,
        createdAt: staleCreatedAt,
      },
      {
        email: 'stale-3@example.com',
        message: 'Stale message 3',
        sourceIpHash,
        createdAt: staleCreatedAt,
      },
    ])

    const result = await createContactCaller(ip).contact.create(buildInput(4))

    expect(result).toEqual({ success: true })
    expect(await countContactMessages()).toBe(4)
  })

  it('allows a different ip after one ip has already hit the limit', async () => {
    const blockedCaller = createContactCaller('198.51.100.60')

    await blockedCaller.contact.create(buildInput(1))
    await blockedCaller.contact.create(buildInput(2))
    await blockedCaller.contact.create(buildInput(3))
    await expect(blockedCaller.contact.create(buildInput(4))).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    } satisfies Partial<TRPCError>)

    const otherResult = await createContactCaller('203.0.113.60').contact.create(buildInput(5))

    expect(otherResult).toEqual({ success: true })
    expect(await countContactMessages()).toBe(4)
  })
})
