import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  benchmarkModelSnapshots,
  benchmarkProtocols,
  benchmarkSeasonModels,
  benchmarkSeasons,
  categories,
  llms,
  matchBatches,
  matchEvaluations,
  matchPromptTemplates,
  subcategories,
  toolCategories,
  tools,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { seedUser } from '~/test/trpc'
import { claimMatchBatchExecution, createMatchBatch } from './batches'

function first<T>(arr: T[]): T {
  if (arr.length === 0) throw new Error('Expected at least one result')
  return arr[0] as T
}

async function seedMatchFixture() {
  const db = getTestDb()

  const { profile: admin } = await seedUser({ role: 'admin' })

  const group = first(
    await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
      .returning(),
  )
  const category = first(
    await db
      .insert(subcategories)
      .values({ name: 'Auth', slug: 'auth', categoryId: group.id })
      .returning(),
  )

  const toolA = first(await db.insert(tools).values({ name: 'Clerk', slug: 'clerk' }).returning())
  const toolB = first(await db.insert(tools).values({ name: 'Auth0', slug: 'auth0' }).returning())
  const toolC = first(
    await db.insert(tools).values({ name: 'Firebase', slug: 'firebase' }).returning(),
  )

  await db.insert(toolCategories).values([
    { toolId: toolA.id, categoryId: category.id },
    { toolId: toolB.id, categoryId: category.id },
  ])

  const protocol = first(
    await db
      .insert(benchmarkProtocols)
      .values({
        slug: 'proto-1',
        name: 'Protocol 1',
        mode: 'benchmark',
        parserVersion: 'strict-v1',
        scoringVersion: '1.0',
        promptContractVersion: '1.0',
      })
      .returning(),
  )

  const season = first(
    await db
      .insert(benchmarkSeasons)
      .values({
        protocolId: protocol.id,
        slug: 'season-1',
        name: 'Season 1',
        status: 'active',
      })
      .returning(),
  )

  const llm = first(
    await db
      .insert(llms)
      .values({
        name: 'GPT-4o',
        slug: 'gpt-4o',
        provider: 'openai',
        modelId: 'gpt-4o',
      })
      .returning(),
  )

  const snapshot = first(
    await db
      .insert(benchmarkModelSnapshots)
      .values({
        llmId: llm.id,
        name: 'GPT-4o',
        provider: 'openai',
        tier: 'frontier',
        requestedModelId: 'gpt-4o',
        snapshotKey: 'gpt-4o::0.2::1::1200::null',
      })
      .returning(),
  )

  await db.insert(benchmarkSeasonModels).values({
    seasonId: season.id,
    modelSnapshotId: snapshot.id,
  })

  const template = first(
    await db
      .insert(matchPromptTemplates)
      .values({
        slug: 'match-compare-v1',
        name: 'Match Compare V1',
        templateMd: 'Compare {{TOOL_A}} vs {{TOOL_B}} for {{CATEGORY}}.',
        schemaVersion: 'match-v2',
        isActive: true,
      })
      .returning(),
  )

  return { admin, category, toolA, toolB, toolC, season, snapshot, template }
}

describe('createMatchBatch', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('should create a batch and materialize evaluation rows', async () => {
    const db = getTestDb()
    const { season, category, toolA, toolB, template } = await seedMatchFixture()

    const batch = await createMatchBatch(db, {
      seasonId: season.id,
      categoryId: category.id,
      toolAId: toolA.id,
      toolBId: toolB.id,
      promptTemplateId: template.id,
      triggerMode: 'manual',
    })

    expect(batch.status).toBe('pending')
    expect(batch.totalEvaluations).toBe(2) // 1 model × 2 presentation orders

    const evals = await db.query.matchEvaluations.findMany({
      where: eq(matchEvaluations.batchId, batch.id),
    })
    expect(evals).toHaveLength(2)
    expect(evals.map((e) => e.presentationOrder).sort()).toEqual(['a_first', 'b_first'])
    expect(evals.every((e) => e.status === 'pending')).toBe(true)
  })

  it('should canonicalize tool order when toolA > toolB', async () => {
    const db = getTestDb()
    const { season, category, toolA, toolB, template } = await seedMatchFixture()

    // Pass in reversed order
    const batch = await createMatchBatch(db, {
      seasonId: season.id,
      categoryId: category.id,
      toolAId: toolB.id, // B first (should be swapped)
      toolBId: toolA.id, // A second
      promptTemplateId: template.id,
      triggerMode: 'manual',
    })

    // Should always have the lower UUID as toolAId
    const [lower, higher] = [toolA.id, toolB.id].sort()
    expect(batch.toolAId).toBe(lower)
    expect(batch.toolBId).toBe(higher)
  })

  it('should reject when tools are not in the category', async () => {
    const db = getTestDb()
    const { season, category, toolC, toolA, template } = await seedMatchFixture()

    // toolC is not in the category
    await expect(
      createMatchBatch(db, {
        seasonId: season.id,
        categoryId: category.id,
        toolAId: toolA.id,
        toolBId: toolC.id,
        promptTemplateId: template.id,
        triggerMode: 'manual',
      }),
    ).rejects.toThrow('Both tools must belong to the selected category')
  })

  it('should reject when season has no frozen models', async () => {
    const db = getTestDb()
    const { season, category, toolA, toolB, template } = await seedMatchFixture()

    // Remove all season models
    await db.delete(benchmarkSeasonModels).where(eq(benchmarkSeasonModels.seasonId, season.id))

    await expect(
      createMatchBatch(db, {
        seasonId: season.id,
        categoryId: category.id,
        toolAId: toolA.id,
        toolBId: toolB.id,
        promptTemplateId: template.id,
        triggerMode: 'manual',
      }),
    ).rejects.toThrow('Season has no frozen model snapshots')
  })

  it('should require benchmarkRunId for benchmark_run batches', async () => {
    const db = getTestDb()
    const { season, category, toolA, toolB, template } = await seedMatchFixture()

    await expect(
      createMatchBatch(db, {
        seasonId: season.id,
        categoryId: category.id,
        toolAId: toolA.id,
        toolBId: toolB.id,
        promptTemplateId: template.id,
        triggerMode: 'benchmark_run',
      }),
    ).rejects.toThrow('benchmarkRunId is required when triggerMode is benchmark_run')
  })

  it('should reject benchmarkRunId for manual batches', async () => {
    const db = getTestDb()
    const { season, category, toolA, toolB, template } = await seedMatchFixture()

    await expect(
      createMatchBatch(db, {
        seasonId: season.id,
        categoryId: category.id,
        toolAId: toolA.id,
        toolBId: toolB.id,
        promptTemplateId: template.id,
        benchmarkRunId: crypto.randomUUID(),
        triggerMode: 'manual',
      }),
    ).rejects.toThrow('benchmarkRunId must be omitted when triggerMode is manual')
  })

  it('should return existing batch on matching idempotency key', async () => {
    const db = getTestDb()
    const { season, category, toolA, toolB, template } = await seedMatchFixture()

    const input = {
      seasonId: season.id,
      categoryId: category.id,
      toolAId: toolA.id,
      toolBId: toolB.id,
      promptTemplateId: template.id,
      triggerMode: 'manual' as const,
      idempotencyKey: 'test-key-1',
    }

    const batch1 = await createMatchBatch(db, input)
    const batch2 = await createMatchBatch(db, input)

    expect(batch1.id).toBe(batch2.id)
  })

  it('should reject idempotency key reuse with different dimensions', async () => {
    const db = getTestDb()
    const { season, category, toolA, toolB, template } = await seedMatchFixture()

    // Create second template
    const template2 = first(
      await db
        .insert(matchPromptTemplates)
        .values({
          slug: 'match-compare-v2',
          name: 'Match Compare V2',
          templateMd: 'V2: Compare {{TOOL_A}} vs {{TOOL_B}} for {{CATEGORY}}.',
          schemaVersion: 'match-v2',
        })
        .returning(),
    )

    await createMatchBatch(db, {
      seasonId: season.id,
      categoryId: category.id,
      toolAId: toolA.id,
      toolBId: toolB.id,
      promptTemplateId: template.id,
      triggerMode: 'manual',
      idempotencyKey: 'key-conflict',
    })

    await expect(
      createMatchBatch(db, {
        seasonId: season.id,
        categoryId: category.id,
        toolAId: toolA.id,
        toolBId: toolB.id,
        promptTemplateId: template2.id, // Different template
        triggerMode: 'manual',
        idempotencyKey: 'key-conflict',
      }),
    ).rejects.toThrow('Idempotency key conflict')
  })
})

describe('claimMatchBatchExecution', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('should claim a pending batch', async () => {
    const db = getTestDb()
    const { season, category, toolA, toolB, template } = await seedMatchFixture()

    const batch = await createMatchBatch(db, {
      seasonId: season.id,
      categoryId: category.id,
      toolAId: toolA.id,
      toolBId: toolB.id,
      promptTemplateId: template.id,
      triggerMode: 'manual',
    })

    const result = await claimMatchBatchExecution(db, batch.id)

    expect(result.execute).toBe(true)
    expect(result.claimToken).toBeTruthy()
    expect(result.batch.status).toBe('running')
  })

  it('should return execute=false for a completed batch', async () => {
    const db = getTestDb()
    const { season, category, toolA, toolB, template } = await seedMatchFixture()

    const batch = await createMatchBatch(db, {
      seasonId: season.id,
      categoryId: category.id,
      toolAId: toolA.id,
      toolBId: toolB.id,
      promptTemplateId: template.id,
      triggerMode: 'manual',
    })

    // Manually mark as completed
    await db
      .update(matchBatches)
      .set({ status: 'completed', completedAt: new Date() })
      .where(eq(matchBatches.id, batch.id))

    const result = await claimMatchBatchExecution(db, batch.id)

    expect(result.execute).toBe(false)
    expect(result.claimToken).toBeNull()
  })

  it('should reclaim a stale running batch', async () => {
    const db = getTestDb()
    const { season, category, toolA, toolB, template } = await seedMatchFixture()

    const batch = await createMatchBatch(db, {
      seasonId: season.id,
      categoryId: category.id,
      toolAId: toolA.id,
      toolBId: toolB.id,
      promptTemplateId: template.id,
      triggerMode: 'manual',
    })

    // Simulate a stale running batch
    const staleTime = new Date(Date.now() - 20 * 60 * 1000) // 20 minutes ago
    await db
      .update(matchBatches)
      .set({
        status: 'running',
        claimToken: crypto.randomUUID(),
        startedAt: staleTime,
        lastHeartbeatAt: staleTime,
      })
      .where(eq(matchBatches.id, batch.id))

    const result = await claimMatchBatchExecution(db, batch.id, {
      staleAfterMs: 10 * 60 * 1000,
    })

    expect(result.execute).toBe(true)
    expect(result.claimToken).toBeTruthy()
  })

  it('should reclaim a running batch exactly at stale cutoff', async () => {
    const db = getTestDb()
    const { season, category, toolA, toolB, template } = await seedMatchFixture()
    const staleAfterMs = 10 * 60 * 1000
    const now = new Date('2026-01-01T00:10:00.000Z')
    const boundaryTime = new Date(now.getTime() - staleAfterMs)

    const batch = await createMatchBatch(db, {
      seasonId: season.id,
      categoryId: category.id,
      toolAId: toolA.id,
      toolBId: toolB.id,
      promptTemplateId: template.id,
      triggerMode: 'manual',
    })

    await db
      .update(matchBatches)
      .set({
        status: 'running',
        claimToken: crypto.randomUUID(),
        startedAt: boundaryTime,
        lastHeartbeatAt: boundaryTime,
      })
      .where(eq(matchBatches.id, batch.id))

    const result = await claimMatchBatchExecution(db, batch.id, {
      staleAfterMs,
      now: () => now,
    })

    expect(result.execute).toBe(true)
    expect(result.claimToken).toBeTruthy()
  })

  it('should not reclaim a fresh running batch', async () => {
    const db = getTestDb()
    const { season, category, toolA, toolB, template } = await seedMatchFixture()

    const batch = await createMatchBatch(db, {
      seasonId: season.id,
      categoryId: category.id,
      toolAId: toolA.id,
      toolBId: toolB.id,
      promptTemplateId: template.id,
      triggerMode: 'manual',
    })

    // Simulate a fresh running batch
    const freshTime = new Date()
    await db
      .update(matchBatches)
      .set({
        status: 'running',
        claimToken: crypto.randomUUID(),
        startedAt: freshTime,
        lastHeartbeatAt: freshTime,
      })
      .where(eq(matchBatches.id, batch.id))

    const result = await claimMatchBatchExecution(db, batch.id)

    expect(result.execute).toBe(false)
    expect(result.claimToken).toBeNull()
  })
})
