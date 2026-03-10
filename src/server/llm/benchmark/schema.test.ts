import { describe, expect, it } from 'vitest'
import { benchmarkAppendixSchema, validateBenchmarkAppendix } from './schema'

describe('benchmarkAppendixSchema', () => {
  const validAppendix = {
    schema_version: 'benchmark-v1' as const,
    categories: [
      {
        category_slug: 'auth',
        decision: 'tool' as const,
        tool: 'Clerk',
        reasoning: 'Best fit for this use case',
        confidence: 0.85,
      },
      {
        category_slug: 'database',
        decision: 'none' as const,
        reasoning: 'No database needed',
        confidence: 0.9,
      },
    ],
  }

  it('should validate a correct appendix', () => {
    const result = benchmarkAppendixSchema.safeParse(validAppendix)
    expect(result.success).toBe(true)
  })

  it('should reject invalid schema_version', () => {
    const result = benchmarkAppendixSchema.safeParse({
      ...validAppendix,
      schema_version: 'v2',
    })
    expect(result.success).toBe(false)
  })

  it('should reject decision=tool without tool field', () => {
    const result = benchmarkAppendixSchema.safeParse({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          reasoning: 'Some reasoning',
          confidence: 0.8,
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('should reject decision=none with tool field set', () => {
    const result = benchmarkAppendixSchema.safeParse({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'none',
          tool: 'Clerk',
          reasoning: 'No tool needed',
          confidence: 0.8,
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('should reject confidence below 0', () => {
    const result = benchmarkAppendixSchema.safeParse({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'none',
          reasoning: 'No tool needed',
          confidence: -0.1,
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('should reject confidence above 1', () => {
    const result = benchmarkAppendixSchema.safeParse({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'none',
          reasoning: 'No tool needed',
          confidence: 1.1,
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('should reject empty categories array', () => {
    const result = benchmarkAppendixSchema.safeParse({
      schema_version: 'benchmark-v1',
      categories: [],
    })
    expect(result.success).toBe(false)
  })

  it('should reject empty reasoning', () => {
    const result = benchmarkAppendixSchema.safeParse({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'none',
          reasoning: '',
          confidence: 0.8,
        },
      ],
    })
    expect(result.success).toBe(false)
  })
})

describe('validateBenchmarkAppendix', () => {
  it('should pass when categories match exactly', () => {
    const data = {
      schema_version: 'benchmark-v1' as const,
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool' as const,
          tool: 'Clerk',
          reasoning: 'Best fit',
          confidence: 0.85,
        },
        {
          category_slug: 'database',
          decision: 'none' as const,
          reasoning: 'Not needed',
          confidence: 0.9,
        },
      ],
    }
    const result = validateBenchmarkAppendix(data, ['auth', 'database'])
    expect(result.success).toBe(true)
  })

  it('should fail when eligible categories are missing', () => {
    const data = {
      schema_version: 'benchmark-v1' as const,
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool' as const,
          tool: 'Clerk',
          reasoning: 'Best fit',
          confidence: 0.85,
        },
      ],
    }
    const result = validateBenchmarkAppendix(data, ['auth', 'database'])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Missing eligible categories')
      expect(result.error).toContain('database')
    }
  })

  it('should fail when extra categories are present', () => {
    const data = {
      schema_version: 'benchmark-v1' as const,
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool' as const,
          tool: 'Clerk',
          reasoning: 'Best fit',
          confidence: 0.85,
        },
        {
          category_slug: 'payments',
          decision: 'none' as const,
          reasoning: 'Extra',
          confidence: 0.5,
        },
      ],
    }
    const result = validateBenchmarkAppendix(data, ['auth'])
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('Extra categories')
      expect(result.error).toContain('payments')
    }
  })

  it('should fail on malformed JSON (non-object)', () => {
    const result = validateBenchmarkAppendix('not json', ['auth'])
    expect(result.success).toBe(false)
  })
})
