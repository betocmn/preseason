import { createHash } from 'node:crypto'
import type { TRPCError } from '@trpc/server'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { serverSettings } from '~/constants/server-settings'
import { createRateLimitedContactMessage } from '~/server/api/helpers/contact-rate-limit'
import { contactMessages } from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'

function buildInput(index: number) {
  return {
    email: `contact-${index}@example.com`,
    message: `Contact message ${index}`,
  }
}

async function countContactMessages() {
  const rows = await getTestDb()
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(contactMessages)

  return rows[0]?.count ?? 0
}

describe('createRateLimitedContactMessage', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('uses the last untrusted forwarded hop when a single proxy appends the client ip', async () => {
    const db = getTestDb()

    await createRateLimitedContactMessage(
      db,
      new Headers({
        'x-forwarded-for': '203.0.113.5, 198.51.100.50',
      }),
      buildInput(1),
    )

    const rows = await db.select().from(contactMessages)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.sourceIpHash).toBe(createHash('sha256').update('198.51.100.50').digest('hex'))
    expect(rows[0]?.sourceIpHash).not.toBe(createHash('sha256').update('203.0.113.5').digest('hex'))
  })

  it('can derive the client hop from a multi-proxy x-forwarded-for chain', async () => {
    const db = getTestDb()
    const originalTrustedProxyHops = serverSettings.contact.forwardedForTrustedProxyHops

    ;(
      serverSettings.contact as { forwardedForTrustedProxyHops: number }
    ).forwardedForTrustedProxyHops = 2

    try {
      await createRateLimitedContactMessage(
        db,
        new Headers({
          'x-forwarded-for': '198.51.100.25, 192.0.2.10',
        }),
        buildInput(1),
      )

      const rows = await db.select().from(contactMessages)
      expect(rows).toHaveLength(1)
      expect(rows[0]?.sourceIpHash).toBe(createHash('sha256').update('198.51.100.25').digest('hex'))
    } finally {
      ;(
        serverSettings.contact as { forwardedForTrustedProxyHops: number }
      ).forwardedForTrustedProxyHops = originalTrustedProxyHops
    }
  })

  it('normalizes forwarded ipv4 hops with ports before hashing and rate limiting', async () => {
    const db = getTestDb()

    await createRateLimitedContactMessage(
      db,
      new Headers({
        'x-forwarded-for': '198.51.100.25:53144',
      }),
      buildInput(1),
    )
    await createRateLimitedContactMessage(
      db,
      new Headers({
        'x-forwarded-for': '198.51.100.25:53145',
      }),
      buildInput(2),
    )
    await createRateLimitedContactMessage(
      db,
      new Headers({
        'x-forwarded-for': '198.51.100.25:53146',
      }),
      buildInput(3),
    )

    await expect(
      createRateLimitedContactMessage(
        db,
        new Headers({
          'x-forwarded-for': '198.51.100.25:53147',
        }),
        buildInput(4),
      ),
    ).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
    } satisfies Partial<TRPCError>)

    const rows = await db.select().from(contactMessages)
    expect(rows).toHaveLength(3)
    expect(rows[0]?.sourceIpHash).toBe(createHash('sha256').update('198.51.100.25').digest('hex'))
  })

  it('normalizes bracketed ipv6 forwarded hops with ports before hashing', async () => {
    const db = getTestDb()

    await createRateLimitedContactMessage(
      db,
      new Headers({
        'x-forwarded-for': '[2001:DB8::25]:53144',
      }),
      buildInput(1),
    )

    const rows = await db.select().from(contactMessages)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.sourceIpHash).toBe(createHash('sha256').update('2001:db8::25').digest('hex'))
  })

  it('ignores spoofable single-ip headers and keys on the forwarded chain', async () => {
    const db = getTestDb()

    await createRateLimitedContactMessage(
      db,
      new Headers({
        'cf-connecting-ip': '203.0.113.99',
        'x-forwarded-for': '198.51.100.25, 192.0.2.10',
        'x-real-ip': '203.0.113.100',
      }),
      buildInput(1),
    )

    const rows = await db.select().from(contactMessages)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.sourceIpHash).toBe(createHash('sha256').update('192.0.2.10').digest('hex'))
    expect(rows[0]?.sourceIpHash).not.toBe(
      createHash('sha256').update('203.0.113.99').digest('hex'),
    )
    expect(rows[0]?.sourceIpHash).not.toBe(
      createHash('sha256').update('203.0.113.100').digest('hex'),
    )
  })

  it('falls back to a stable header fingerprint when the trusted forwarded chain is missing', async () => {
    const db = getTestDb()
    const headers = new Headers({
      'accept-language': 'en-US,en;q=0.9',
      'cf-connecting-ip': '203.0.113.101',
      host: 'preseason.dev',
      'user-agent': 'Vitest Browser/1.0',
      'x-real-ip': '203.0.113.102',
    })

    await createRateLimitedContactMessage(db, headers, buildInput(1))
    await createRateLimitedContactMessage(db, headers, buildInput(2))
    await createRateLimitedContactMessage(db, headers, buildInput(3))

    await expect(createRateLimitedContactMessage(db, headers, buildInput(4))).rejects.toMatchObject(
      {
        code: 'TOO_MANY_REQUESTS',
      } satisfies Partial<TRPCError>,
    )

    expect(await countContactMessages()).toBe(3)
  })
})
