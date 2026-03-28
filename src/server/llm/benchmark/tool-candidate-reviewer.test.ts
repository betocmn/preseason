import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { toolCandidates } from '~/server/db/schema'
import type { CompletionRequest, CompletionResponse } from '~/server/llm/service'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller, seedUser } from '~/test/trpc'
import { reviewPendingToolCandidates } from './tool-candidate-reviewer'

type MockCompleteFn = (_provider: string, request: CompletionRequest) => Promise<CompletionResponse>

function createMockLlmService(completeFn: MockCompleteFn) {
  return {
    complete: vi.fn(completeFn),
  }
}

describe('reviewPendingToolCandidates', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('stores an ai-reviewed suggestion for fuzzy branded variants', async () => {
    const { authUser } = await seedUser({ role: 'admin' })
    const adminCaller = createTestCaller(authUser)

    const group = await adminCaller.category.createGroup({
      name: 'Devtools',
      slug: 'devtools',
      displayOrder: 1,
    })
    if (!group) throw new Error('Expected category group')

    const category = await adminCaller.category.create({
      name: 'CI/CD',
      slug: 'ci-cd',
      categoryId: group.id,
      description: 'CI',
      icon: 'refresh-cw',
      displayOrder: 1,
    })
    if (!category) throw new Error('Expected category')

    const tool = await adminCaller.tool.create({
      name: 'Simple',
      slug: 'simple',
      categoryIds: [category.id],
    })
    if (!tool) throw new Error('Expected tool')

    const db = getTestDb()
    const [candidate] = await db
      .insert(toolCandidates)
      .values({
        rawName: 'Simple Labs CI',
        normalizedName: 'simple labs ci',
        suggestedCategoryId: category.id,
      })
      .returning()
    if (!candidate) throw new Error('Expected candidate')

    const llmService = createMockLlmService(async () => ({
      content: `<preseason_tool_candidate_review_json>${JSON.stringify({
        schema_version: 'tool-candidate-review-v1',
        decision: 'match',
        tool_id: tool.id,
        confidence: 0.88,
        reason: 'This is a branded CI variant of the Simple tool.',
      })}</preseason_tool_candidate_review_json>`,
      requestedModel: 'openai/gpt-5.4-mini',
      returnedModel: 'openai/gpt-5.4-mini',
      provider: 'openai',
      finishReason: 'stop',
      usage: {
        promptTokens: 100,
        completionTokens: 30,
        totalTokens: 130,
      },
      latencyMs: 25,
    }))

    const summary = await reviewPendingToolCandidates({
      database: db,
      llmService: llmService as never,
      now: () => new Date('2026-03-28T00:00:00Z'),
    })

    const reviewedCandidate = await db.query.toolCandidates.findFirst({
      where: (fields, { eq }) => eq(fields.id, candidate.id),
    })

    expect(summary).toEqual({
      reviewedCount: 1,
      suggestedCount: 1,
      noMatchCount: 0,
      errorCount: 0,
    })
    expect(reviewedCandidate?.aiSuggestedToolId).toBe(tool.id)
    expect(reviewedCandidate?.aiReviewConfidence).toBe(0.88)
    expect(reviewedCandidate?.aiReviewReason).toBe(
      'This is a branded CI variant of the Simple tool.',
    )
    expect(reviewedCandidate?.aiReviewModel).toBe('openai/gpt-5.4-mini')
    expect(reviewedCandidate?.aiReviewError).toBeNull()
    expect(llmService.complete).toHaveBeenCalledTimes(1)
  })

  it('marks candidates as reviewed without calling the llm when no shortlist qualifies', async () => {
    const db = getTestDb()
    const [candidate] = await db
      .insert(toolCandidates)
      .values({
        rawName: 'Completely Unknown Platform',
        normalizedName: 'completely unknown platform',
      })
      .returning()
    if (!candidate) throw new Error('Expected candidate')

    const llmService = createMockLlmService(async () => {
      throw new Error('LLM should not be called')
    })

    const summary = await reviewPendingToolCandidates({
      database: db,
      llmService: llmService as never,
      now: () => new Date('2026-03-28T00:00:00Z'),
    })

    const reviewedCandidate = await db.query.toolCandidates.findFirst({
      where: (fields, { eq }) => eq(fields.id, candidate.id),
    })

    expect(summary).toEqual({
      reviewedCount: 1,
      suggestedCount: 0,
      noMatchCount: 1,
      errorCount: 0,
    })
    expect(reviewedCandidate?.aiSuggestedToolId).toBeNull()
    expect(reviewedCandidate?.aiReviewReason).toBe('No shortlist cleared the similarity threshold')
    expect(reviewedCandidate?.aiReviewError).toBeNull()
    expect(llmService.complete).not.toHaveBeenCalled()
  })
})
