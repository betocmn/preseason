import { describe, expect, it } from 'vitest'
import { matchResponseSchema, validateMatchResponse } from './schema'

function buildValidResponse() {
  return {
    schema_version: 'match-v2' as const,
    winner: 'tool_a' as const,
    comparison_summary: 'Tool A is better suited for this use case.',
    tool_a: {
      pros: [{ phrase: 'Easy setup', evidence_sentence: 'Tool A requires minimal configuration.' }],
      cons: [{ phrase: 'Limited docs', evidence_sentence: 'Documentation could be improved.' }],
    },
    tool_b: {
      pros: [{ phrase: 'Rich ecosystem', evidence_sentence: 'Has many plugins available.' }],
      cons: [{ phrase: 'Complex setup', evidence_sentence: 'Requires significant configuration.' }],
    },
    confidence: 0.85,
  }
}

describe('matchResponseSchema', () => {
  it('should validate a correct response', () => {
    const result = matchResponseSchema.safeParse(buildValidResponse())
    expect(result.success).toBe(true)
  })

  it('should reject invalid schema_version', () => {
    const result = matchResponseSchema.safeParse({
      ...buildValidResponse(),
      schema_version: 'v1',
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid winner value', () => {
    const result = matchResponseSchema.safeParse({
      ...buildValidResponse(),
      winner: 'tool_c',
    })
    expect(result.success).toBe(false)
  })

  it('should accept all valid winner values', () => {
    for (const winner of ['tool_a', 'tool_b', 'tie', 'abstain']) {
      const result = matchResponseSchema.safeParse({
        ...buildValidResponse(),
        winner,
      })
      expect(result.success).toBe(true)
    }
  })

  it('should reject confidence below 0', () => {
    const result = matchResponseSchema.safeParse({
      ...buildValidResponse(),
      confidence: -0.1,
    })
    expect(result.success).toBe(false)
  })

  it('should reject confidence above 1', () => {
    const result = matchResponseSchema.safeParse({
      ...buildValidResponse(),
      confidence: 1.1,
    })
    expect(result.success).toBe(false)
  })

  it('should reject empty comparison_summary', () => {
    const result = matchResponseSchema.safeParse({
      ...buildValidResponse(),
      comparison_summary: '',
    })
    expect(result.success).toBe(false)
  })

  it('should reject phrase exceeding 100 characters', () => {
    const response = buildValidResponse()
    response.tool_a.pros = [{ phrase: 'x'.repeat(101), evidence_sentence: 'Some evidence.' }]
    const result = matchResponseSchema.safeParse(response)
    expect(result.success).toBe(false)
  })

  it('should reject evidence_sentence exceeding 280 characters', () => {
    const response = buildValidResponse()
    response.tool_a.pros = [{ phrase: 'Good', evidence_sentence: 'x'.repeat(281) }]
    const result = matchResponseSchema.safeParse(response)
    expect(result.success).toBe(false)
  })

  it('should reject more than 8 pros', () => {
    const response = buildValidResponse()
    response.tool_a.pros = Array.from({ length: 9 }, (_, i) => ({
      phrase: `Pro ${i}`,
      evidence_sentence: `Evidence ${i}`,
    }))
    const result = matchResponseSchema.safeParse(response)
    expect(result.success).toBe(false)
  })

  it('should accept empty pros and cons arrays', () => {
    const response = buildValidResponse()
    response.tool_a.pros = []
    response.tool_a.cons = []
    const result = matchResponseSchema.safeParse(response)
    expect(result.success).toBe(true)
  })

  it('should reject missing required fields', () => {
    const result = matchResponseSchema.safeParse({
      schema_version: 'match-v2',
      winner: 'tool_a',
    })
    expect(result.success).toBe(false)
  })
})

describe('validateMatchResponse', () => {
  it('should return success for valid data', () => {
    const result = validateMatchResponse(buildValidResponse())
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.winner).toBe('tool_a')
    }
  })

  it('should return error for invalid data', () => {
    const result = validateMatchResponse({ wrong: 'data' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeTruthy()
    }
  })

  it('should return error for non-object', () => {
    const result = validateMatchResponse('not json')
    expect(result.success).toBe(false)
  })
})
