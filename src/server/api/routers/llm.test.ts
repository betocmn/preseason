import type { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { benchmarkModelSnapshots } from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller, seedUser } from '~/test/trpc'

describe('llmRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('lists only active llms', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    await adminCaller.llm.create({
      name: 'GPT-4o',
      slug: 'gpt-4o',
      provider: 'openai',
      company: 'OpenAI',
      modelFamily: 'GPT',
      modelVersion: '4o',
      modelId: 'openai/gpt-4o',
      isActive: true,
    })
    await adminCaller.llm.create({
      name: 'Inactive model',
      slug: 'inactive-model',
      provider: 'openai',
      company: 'OpenAI',
      modelFamily: 'GPT',
      modelVersion: 'inactive',
      modelId: 'openai/inactive',
      isActive: false,
    })

    const caller = createTestCaller(null)
    const active = await caller.llm.listActive()
    expect(active).toHaveLength(1)
    expect(active[0]?.slug).toBe('gpt-4o')
  })

  it('supports admin CRUD and toggleActive', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)

    const created = await caller.llm.create({
      name: 'Claude 3.5 Sonnet',
      slug: 'claude-3-5-sonnet',
      provider: 'anthropic',
      company: 'Anthropic',
      modelFamily: 'Sonnet',
      modelVersion: '3.5',
      modelId: 'anthropic/claude-3.5-sonnet',
      isActive: true,
    })
    expect(created?.slug).toBe('claude-3-5-sonnet')

    const updated = await caller.llm.update({
      id: created?.id ?? '',
      modelVersion: '3.7',
    })
    expect(updated.modelVersion).toBe('3.7')

    const toggled = await caller.llm.toggleActive({
      id: created?.id ?? '',
      isActive: false,
    })
    expect(toggled.isActive).toBe(false)

    const deleted = await caller.llm.delete({ id: created?.id ?? '' })
    expect(deleted.success).toBe(true)
  })

  it('rejects non-admin mutations', async () => {
    const { authUser } = await seedUser({ role: 'user' })
    const caller = createTestCaller(authUser)

    await expect(
      caller.llm.create({
        name: 'Blocked',
        slug: 'blocked',
        provider: 'openai',
        company: 'OpenAI',
        modelFamily: 'GPT',
        modelVersion: 'blocked',
        modelId: 'x/blocked',
        isActive: true,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)
  })

  it('returns not found for unknown slug', async () => {
    const caller = createTestCaller(null)
    await expect(caller.llm.getBySlug({ slug: 'missing' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<TRPCError>)
  })

  it('marks used llms and rejects deleting them', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const caller = createTestCaller(authUser)
    const db = getTestDb()

    const created = await caller.llm.create({
      name: 'GPT-4o',
      slug: 'gpt-4o',
      provider: 'openai',
      company: 'OpenAI',
      modelFamily: 'GPT',
      modelVersion: '4o',
      modelId: 'openai/gpt-4o',
      isActive: true,
    })
    if (!created) {
      throw new Error('Expected llm to be created')
    }

    await db.insert(benchmarkModelSnapshots).values({
      llmId: created.id,
      name: created.name,
      provider: created.provider,
      company: created.company,
      modelFamily: created.modelFamily,
      modelVersion: created.modelVersion,
      tier: 'frontier',
      requestedModelId: created.modelId,
      snapshotKey: `snapshot-${crypto.randomUUID()}`,
      isDeterministic: false,
    })

    const listed = await caller.llm.list()
    expect(listed.find((llm) => llm.id === created.id)?.isUsed).toBe(true)

    await expect(caller.llm.delete({ id: created.id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'LLMs that have already been used in benchmark seasons cannot be deleted',
    } satisfies Partial<TRPCError>)
  })
})
