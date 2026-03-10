import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { llms } from '~/server/db/schema'
import {
  computeSnapshotKey,
  getOrCreateModelSnapshot,
} from '~/server/llm/benchmark/model-snapshotter'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error('Expected at least one row')
  return row
}

async function seedLlm(
  db: ReturnType<typeof getTestDb>,
  overrides: { name?: string; slug?: string; provider?: string; modelId?: string } = {},
) {
  return first(
    await db
      .insert(llms)
      .values({
        name: overrides.name ?? 'Claude Opus',
        slug: overrides.slug ?? 'claude-opus',
        provider: overrides.provider ?? 'anthropic',
        modelId: overrides.modelId ?? 'claude-3-opus-20240229',
      })
      .returning(),
  )
}

describe('computeSnapshotKey', () => {
  it('produces deterministic key from params', () => {
    const key = computeSnapshotKey({
      requestedModelId: 'claude-3-opus-20240229',
      temperature: 0.2,
      topP: 1,
      maxTokens: 1200,
      seed: 42,
    })
    expect(key).toBe('claude-3-opus-20240229:0.2:1:1200:42')
  })

  it('uses "default" for missing optional params', () => {
    const key = computeSnapshotKey({
      requestedModelId: 'gpt-4o',
    })
    expect(key).toBe('gpt-4o:default:default:default:default')
  })

  it('uses "default" for null params', () => {
    const key = computeSnapshotKey({
      requestedModelId: 'gpt-4o',
      temperature: null,
      topP: null,
      maxTokens: null,
      seed: null,
    })
    expect(key).toBe('gpt-4o:default:default:default:default')
  })

  it('includes all params when fully specified', () => {
    const key = computeSnapshotKey({
      requestedModelId: 'mistral-large',
      temperature: 0.7,
      topP: 0.9,
      maxTokens: 2048,
      seed: 123,
    })
    expect(key).toBe('mistral-large:0.7:0.9:2048:123')
  })
})

describe('getOrCreateModelSnapshot', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('creates a new snapshot with correct tier assignment', async () => {
    const db = getTestDb()
    const llm = await seedLlm(db)

    const snapshot = await getOrCreateModelSnapshot(db, llm.id, {
      requestedModelId: 'claude-3-opus-20240229',
      temperature: 0.2,
      topP: 1,
      maxTokens: 1200,
    })

    expect(snapshot.llmId).toBe(llm.id)
    expect(snapshot.name).toBe('Claude Opus')
    expect(snapshot.provider).toBe('anthropic')
    expect(snapshot.tier).toBe('frontier')
    expect(snapshot.requestedModelId).toBe('claude-3-opus-20240229')
    expect(snapshot.modelFamilyKey).toBe('claude-3-opus')
    expect(snapshot.temperature).toBe(0.2)
    expect(snapshot.topP).toBe(1)
    expect(snapshot.maxTokens).toBe(1200)
    expect(snapshot.seed).toBeNull()
    expect(snapshot.isDeterministic).toBe(false)
  })

  it('deduplicates by snapshot key', async () => {
    const db = getTestDb()
    const llm = await seedLlm(db)

    const params = {
      requestedModelId: 'claude-3-opus-20240229',
      temperature: 0.2,
    }

    const first = await getOrCreateModelSnapshot(db, llm.id, params)
    const second = await getOrCreateModelSnapshot(db, llm.id, params)

    expect(first.id).toBe(second.id)
    expect(first.snapshotKey).toBe(second.snapshotKey)
  })

  it('rejects snapshot key collision for a different LLM', async () => {
    const db = getTestDb()
    const llm1 = await seedLlm(db, { slug: 'claude-opus-1' })
    const llm2 = await seedLlm(db, { slug: 'claude-opus-2' })

    const params = {
      requestedModelId: 'claude-3-opus-20240229',
      temperature: 0.2,
    }

    await getOrCreateModelSnapshot(db, llm1.id, params)

    await expect(getOrCreateModelSnapshot(db, llm2.id, params)).rejects.toThrow(
      'already exists for a different LLM',
    )
  })

  it('sets isDeterministic=true when seed is provided', async () => {
    const db = getTestDb()
    const llm = await seedLlm(db)

    const snapshot = await getOrCreateModelSnapshot(db, llm.id, {
      requestedModelId: 'claude-3-opus-20240229',
      seed: 42,
    })

    expect(snapshot.isDeterministic).toBe(true)
  })

  it('sets isDeterministic=false when seed is null', async () => {
    const db = getTestDb()
    const llm = await seedLlm(db)

    const snapshot = await getOrCreateModelSnapshot(db, llm.id, {
      requestedModelId: 'claude-3-opus-20240229',
      seed: null,
    })

    expect(snapshot.isDeterministic).toBe(false)
  })

  it('throws when LLM not found', async () => {
    const db = getTestDb()

    await expect(
      getOrCreateModelSnapshot(db, '00000000-0000-0000-0000-000000000000', {
        requestedModelId: 'claude-3-opus-20240229',
      }),
    ).rejects.toThrow('LLM not found')
  })

  it('stores all inference params', async () => {
    const db = getTestDb()
    const llm = await seedLlm(db)

    const snapshot = await getOrCreateModelSnapshot(db, llm.id, {
      requestedModelId: 'gpt-4o',
      temperature: 0.5,
      topP: 0.9,
      maxTokens: 2048,
      seed: 99,
    })

    expect(snapshot.temperature).toBe(0.5)
    expect(snapshot.topP).toBe(0.9)
    expect(snapshot.maxTokens).toBe(2048)
    expect(snapshot.seed).toBe(99)
  })

  it('assigns correct model family key', async () => {
    const db = getTestDb()
    const llm = await seedLlm(db, {
      name: 'GPT-4o',
      slug: 'gpt-4o',
      provider: 'openai',
      modelId: 'openai/gpt-4o-2024-08-06',
    })

    const snapshot = await getOrCreateModelSnapshot(db, llm.id, {
      requestedModelId: 'openai/gpt-4o-2024-08-06',
    })

    expect(snapshot.modelFamilyKey).toBe('gpt-4o')
  })
})
