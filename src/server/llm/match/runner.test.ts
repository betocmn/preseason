import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
import type { CompletionRequest, CompletionResponse } from '~/server/llm/service/types'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { seedUser } from '~/test/trpc'
import { claimMatchBatchExecution, createMatchBatch } from './batches'
import { runMatchBatch } from './runner'

type MockCompleteFn = (_provider: string, request: CompletionRequest) => Promise<CompletionResponse>

function createMockLlmService(completeFn: MockCompleteFn) {
  const service = {
    complete: vi.fn(completeFn),
    getProvider: vi.fn(),
  }
  return service as unknown as import('~/server/llm/service').LlmService & {
    complete: ReturnType<typeof vi.fn>
  }
}

function first<T>(arr: T[]): T {
  if (arr.length === 0) throw new Error('Expected at least one result')
  return arr[0] as T
}

function buildValidMatchResponse() {
  return JSON.stringify({
    schema_version: 'match-v2',
    winner: 'tool_a',
    comparison_summary: 'Tool A is the clear winner.',
    tool_a: {
      pros: [{ phrase: 'Fast', evidence_sentence: 'Tool A is faster.' }],
      cons: [{ phrase: 'Costly', evidence_sentence: 'Tool A is more expensive.' }],
    },
    tool_b: {
      pros: [{ phrase: 'Cheap', evidence_sentence: 'Tool B is cheaper.' }],
      cons: [{ phrase: 'Slow', evidence_sentence: 'Tool B is slower.' }],
    },
    confidence: 0.9,
  })
}

function wrapResponse(json: string) {
  return `Here is my analysis.\n\n<preseason_match_json>\n${json}\n</preseason_match_json>`
}

function mockCompletion(content: string, requestedModel: string): CompletionResponse {
  return {
    content,
    requestedModel,
    returnedModel: requestedModel,
    provider: 'openai',
    finishReason: 'stop',
    usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    latencyMs: 500,
  }
}

async function seedRunnerFixture() {
  const db = getTestDb()

  await seedUser({ role: 'admin' })

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
        company: 'OpenAI',
        modelFamily: 'GPT',
        modelVersion: '4o',
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
        company: 'OpenAI',
        modelFamily: 'GPT',
        modelVersion: '4o',
        tier: 'frontier',
        requestedModelId: 'gpt-4o',
        snapshotKey: 'gpt-4o::0.2::1::1200::null',
        temperature: 0.2,
        topP: 1,
        maxTokens: 1200,
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

  return { category, toolA, toolB, season, snapshot, template }
}

async function createAndClaimBatch(fixture: Awaited<ReturnType<typeof seedRunnerFixture>>) {
  const db = getTestDb()
  const { season, category, toolA, toolB, template } = fixture

  const batch = await createMatchBatch(db, {
    seasonId: season.id,
    categoryId: category.id,
    toolAId: toolA.id,
    toolBId: toolB.id,
    promptTemplateId: template.id,
    triggerMode: 'manual',
  })

  const claim = await claimMatchBatchExecution(db, batch.id)
  if (!claim.claimToken) throw new Error('Expected claim token')
  return { batch: claim.batch, claimToken: claim.claimToken }
}

describe('runMatchBatch', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('should complete all evaluations successfully', async () => {
    const db = getTestDb()
    const fixture = await seedRunnerFixture()
    const { batch, claimToken } = await createAndClaimBatch(fixture)

    const mockLlm = createMockLlmService(async (_provider, request) =>
      mockCompletion(wrapResponse(buildValidMatchResponse()), request.model),
    )

    const summary = await runMatchBatch(batch.id, claimToken, {
      database: db,
      llmService: mockLlm,
      heartbeatIntervalMs: 999_999, // Don't heartbeat during test
    })

    expect(summary.status).toBe('completed')
    expect(summary.completedEvaluations).toBe(2)
    expect(summary.failedEvaluations).toBe(0)
    expect(summary.invalidOutputEvaluations).toBe(0)

    // Verify evaluations are stored
    const evals = await db.query.matchEvaluations.findMany({
      where: eq(matchEvaluations.batchId, batch.id),
    })
    expect(evals.every((e) => e.status === 'completed')).toBe(true)
    expect(evals.every((e) => e.winnerDecision != null)).toBe(true)
    expect(evals.every((e) => e.renderedUserPrompt != null)).toBe(true)
  })

  it('should handle model drift as invalid_output', async () => {
    const db = getTestDb()
    const fixture = await seedRunnerFixture()
    const { batch, claimToken } = await createAndClaimBatch(fixture)

    const mockLlm = createMockLlmService(async () => ({
      content: wrapResponse(buildValidMatchResponse()),
      requestedModel: 'gpt-4o',
      returnedModel: 'gpt-4o-mini', // DRIFT
      provider: 'openai',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
      latencyMs: 500,
    }))

    const summary = await runMatchBatch(batch.id, claimToken, {
      database: db,
      llmService: mockLlm,
      heartbeatIntervalMs: 999_999,
    })

    expect(summary.status).toBe('failed')
    expect(summary.invalidOutputEvaluations).toBe(2)

    const evals = await db.query.matchEvaluations.findMany({
      where: eq(matchEvaluations.batchId, batch.id),
    })
    expect(evals.every((e) => e.status === 'invalid_output')).toBe(true)
    expect(evals.every((e) => e.errorMessage?.includes('Model drift'))).toBe(true)
  })

  it('should handle parse failure as invalid_output', async () => {
    const db = getTestDb()
    const fixture = await seedRunnerFixture()
    const { batch, claimToken } = await createAndClaimBatch(fixture)

    const mockLlm = createMockLlmService(async (_provider, request) =>
      mockCompletion('Just a plain response without JSON tags', request.model),
    )

    const summary = await runMatchBatch(batch.id, claimToken, {
      database: db,
      llmService: mockLlm,
      heartbeatIntervalMs: 999_999,
    })

    expect(summary.status).toBe('failed')
    expect(summary.invalidOutputEvaluations).toBe(2)
  })

  it('should handle transport error as failed', async () => {
    const db = getTestDb()
    const fixture = await seedRunnerFixture()
    const { batch, claimToken } = await createAndClaimBatch(fixture)

    const mockLlm = createMockLlmService(async () => {
      throw new Error('Network timeout')
    })

    const summary = await runMatchBatch(batch.id, claimToken, {
      database: db,
      llmService: mockLlm,
      heartbeatIntervalMs: 999_999,
    })

    expect(summary.status).toBe('failed')
    expect(summary.failedEvaluations).toBe(2)

    const evals = await db.query.matchEvaluations.findMany({
      where: eq(matchEvaluations.batchId, batch.id),
    })
    expect(evals.every((e) => e.status === 'failed')).toBe(true)
    expect(evals.every((e) => e.errorMessage?.includes('Network timeout'))).toBe(true)
  })

  it('should remap winner correctly for b_first presentation order', async () => {
    const db = getTestDb()
    const fixture = await seedRunnerFixture()
    const { batch, claimToken } = await createAndClaimBatch(fixture)

    // The LLM always says "tool_a" wins (the first tool in prompt)
    const mockLlm = createMockLlmService(async (_provider, request) =>
      mockCompletion(wrapResponse(buildValidMatchResponse()), request.model),
    )

    await runMatchBatch(batch.id, claimToken, {
      database: db,
      llmService: mockLlm,
      heartbeatIntervalMs: 999_999,
    })

    const evals = await db.query.matchEvaluations.findMany({
      where: eq(matchEvaluations.batchId, batch.id),
    })

    const [canonToolA, canonToolB] = [fixture.toolA.id, fixture.toolB.id].sort()

    const aFirstEval = evals.find((e) => e.presentationOrder === 'a_first')
    if (!aFirstEval) throw new Error('Expected a_first evaluation')
    // In a_first, "tool_a" winner = canonical tool A
    expect(aFirstEval.winnerId).toBe(canonToolA)
    expect(aFirstEval.winnerDecision).toBe('tool_a')

    const bFirstEval = evals.find((e) => e.presentationOrder === 'b_first')
    if (!bFirstEval) throw new Error('Expected b_first evaluation')
    // In b_first, LLM says "tool_a" wins (which is actually canonical tool B since we swapped)
    // So canonical winner should be tool B
    expect(bFirstEval.winnerId).toBe(canonToolB)
    expect(bFirstEval.winnerDecision).toBe('tool_b')
  })

  it('should skip already-completed evaluations on reclaim', async () => {
    const db = getTestDb()
    const fixture = await seedRunnerFixture()
    const { batch, claimToken } = await createAndClaimBatch(fixture)

    // Pre-complete one evaluation
    const evals = await db.query.matchEvaluations.findMany({
      where: eq(matchEvaluations.batchId, batch.id),
    })
    const firstEval = evals[0] as (typeof evals)[number]
    await db
      .update(matchEvaluations)
      .set({ status: 'completed', winnerDecision: 'tool_a' })
      .where(eq(matchEvaluations.id, firstEval.id))

    const mockLlm = createMockLlmService(async (_provider, request) =>
      mockCompletion(wrapResponse(buildValidMatchResponse()), request.model),
    )

    await runMatchBatch(batch.id, claimToken, {
      database: db,
      llmService: mockLlm,
      heartbeatIntervalMs: 999_999,
    })

    // Only 1 LLM call should have been made (the pending one)
    expect(mockLlm.complete).toHaveBeenCalledTimes(1)
  })

  it('should finalize batch as failed when some evaluations fail', async () => {
    const db = getTestDb()
    const fixture = await seedRunnerFixture()
    const { batch, claimToken } = await createAndClaimBatch(fixture)

    let callCount = 0
    const mockLlm = createMockLlmService(async (_provider, request) => {
      callCount++
      if (callCount === 1) {
        return mockCompletion(wrapResponse(buildValidMatchResponse()), request.model)
      }
      throw new Error('Transport error')
    })

    const summary = await runMatchBatch(batch.id, claimToken, {
      database: db,
      llmService: mockLlm,
      heartbeatIntervalMs: 999_999,
    })

    expect(summary.status).toBe('failed')
    expect(summary.completedEvaluations).toBe(1)
    expect(summary.failedEvaluations).toBe(1)
  })

  it('should fail fast when template schema version is unsupported', async () => {
    const db = getTestDb()
    const fixture = await seedRunnerFixture()
    const { batch, claimToken } = await createAndClaimBatch(fixture)

    // Set an unsupported schema version on the template
    await db
      .update(matchPromptTemplates)
      .set({ schemaVersion: 'match-v99' })
      .where(eq(matchPromptTemplates.id, fixture.template.id))

    const mockLlm = createMockLlmService(async (_provider, request) =>
      mockCompletion(wrapResponse(buildValidMatchResponse()), request.model),
    )

    await expect(
      runMatchBatch(batch.id, claimToken, {
        database: db,
        llmService: mockLlm,
        heartbeatIntervalMs: 999_999,
      }),
    ).rejects.toThrow('Unsupported template schema version')

    // No LLM calls should have been made
    expect(mockLlm.complete).toHaveBeenCalledTimes(0)

    // Batch should be transitioned to failed, not left as running
    const batchAfter = await db.query.matchBatches.findFirst({
      where: eq(matchBatches.id, batch.id),
    })
    expect(batchAfter?.status).toBe('failed')
    expect(batchAfter?.completedAt).not.toBeNull()
  })

  it('should detect ownership loss via verifyOwnership when claim token changes', async () => {
    const db = getTestDb()
    const fixture = await seedRunnerFixture()
    const { batch, claimToken } = await createAndClaimBatch(fixture)

    let callCount = 0
    const mockLlm = createMockLlmService(async (_provider, request) => {
      callCount++
      if (callCount === 1) {
        // Simulate another worker stealing ownership between LLM call and DB write
        await db
          .update(matchBatches)
          .set({ claimToken: '00000000-0000-0000-0000-000000000099' })
          .where(eq(matchBatches.id, batch.id))
      }
      return mockCompletion(wrapResponse(buildValidMatchResponse()), request.model)
    })

    const summary = await runMatchBatch(batch.id, claimToken, {
      database: db,
      llmService: mockLlm,
      heartbeatIntervalMs: 999_999,
    })

    // verifyOwnership detects claim token mismatch, breaks loop, finalization
    // also fails ownership check → ownership_lost
    expect(summary.status).toBe('ownership_lost')
    // Only one LLM call should have been made before ownership loss was detected
    expect(callCount).toBe(1)
  })
})
