import { describe, expect, it } from 'vitest'
import { PARSER_VERSION, parseBenchmarkResponse, shouldRepairBenchmarkParseFailure } from './parser'

function buildValidAppendix(
  categories: Array<{ slug: string; decision: 'tool' | 'none'; tool?: string }>,
) {
  return JSON.stringify({
    schema_version: 'benchmark-v1',
    categories: categories.map((c) => ({
      category_slug: c.slug,
      decision: c.decision,
      ...(c.decision === 'tool' ? { tool: c.tool } : {}),
      reasoning: 'Good fit for this use case',
      confidence: 0.8,
    })),
  })
}

function wrapInTags(json: string, prefix = 'Here is my recommendation.\n\n') {
  return `${prefix}<preseason_benchmark_json>\n${json}\n</preseason_benchmark_json>`
}

const ELIGIBLE = ['auth', 'database']

describe('parseBenchmarkResponse', () => {
  it('should parse a valid response with correct categories', () => {
    const json = buildValidAppendix([
      { slug: 'auth', decision: 'tool', tool: 'Clerk' },
      { slug: 'database', decision: 'none' },
    ])
    const raw = wrapInTags(json)
    const result = parseBenchmarkResponse(raw, ELIGIBLE)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.appendix.schema_version).toBe('benchmark-v1')
    expect(result.appendix.categories).toHaveLength(2)
    expect(result.naturalResponse).toBe('Here is my recommendation.')
    expect(result.rawAppendix).toBe(json)
  })

  it('should return invalid_output when tags are missing', () => {
    const result = parseBenchmarkResponse('Just a plain response with no tags', ELIGIBLE)
    expect(result.status).toBe('invalid_output')
    if (result.status !== 'invalid_output') return
    expect(result.reason).toContain('Missing')
    expect(shouldRepairBenchmarkParseFailure(result)).toBe(false)
  })

  it('should return invalid_output when only opening tag is present', () => {
    const result = parseBenchmarkResponse('<preseason_benchmark_json>{}', ELIGIBLE)
    expect(result.status).toBe('invalid_output')
    if (result.status !== 'invalid_output') return
    expect(result.reason).toContain('Truncated')
    expect(shouldRepairBenchmarkParseFailure(result)).toBe(true)
  })

  it('should treat stray opening-tag mentions as unrecoverable invalid output', () => {
    const result = parseBenchmarkResponse(
      'Do not literally print <preseason_benchmark_json> in prose.',
      ELIGIBLE,
    )
    expect(result.status).toBe('invalid_output')
    if (result.status !== 'invalid_output') return
    expect(result.reason).toContain('without JSON appendix')
    expect(shouldRepairBenchmarkParseFailure(result)).toBe(false)
  })

  it('should keep earlier truncated appendices repairable when prose later mentions the tag', () => {
    const raw = [
      'Use Clerk for auth.',
      '',
      '<preseason_benchmark_json>',
      '{"schema_version":"benchmark-v1"',
      '',
      'Do not literally print <preseason_benchmark_json> in prose after the appendix.',
    ].join('\n')
    const result = parseBenchmarkResponse(raw, ELIGIBLE)

    expect(result.status).toBe('invalid_output')
    if (result.status !== 'invalid_output') return
    expect(result.reason).toContain('Truncated')
    expect(shouldRepairBenchmarkParseFailure(result)).toBe(true)
    expect(result.appendixOpenIdx).toBe(raw.indexOf('<preseason_benchmark_json>'))
  })

  it('should ignore closing tag mentions in the natural-language preamble', () => {
    const json = buildValidAppendix([
      { slug: 'auth', decision: 'tool', tool: 'Clerk' },
      { slug: 'database', decision: 'none' },
    ])
    const raw = wrapInTags(
      json,
      'Do not literally print </preseason_benchmark_json> before the JSON block.\n\n',
    )
    const result = parseBenchmarkResponse(raw, ELIGIBLE)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.rawAppendix).toBe(json)
  })

  it('should ignore opening tag mentions in the natural-language preamble', () => {
    const json = buildValidAppendix([
      { slug: 'auth', decision: 'tool', tool: 'Clerk' },
      { slug: 'database', decision: 'none' },
    ])
    const raw = wrapInTags(
      json,
      'Do not literally print <preseason_benchmark_json> before the JSON block.\n\n',
    )
    const result = parseBenchmarkResponse(raw, ELIGIBLE)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.rawAppendix).toBe(json)
  })

  it('should ignore closing tag text inside appendix string fields', () => {
    const json = JSON.stringify({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'Clerk',
          reasoning: 'Mention </preseason_benchmark_json> literally in the rationale',
          confidence: 0.8,
        },
        {
          category_slug: 'database',
          decision: 'none',
          reasoning: 'No database tool needed',
          confidence: 0.9,
        },
      ],
    })
    const result = parseBenchmarkResponse(wrapInTags(json), ELIGIBLE)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.rawAppendix).toBe(json)
  })

  it('should ignore opening tag text inside appendix string fields', () => {
    const json = JSON.stringify({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'Clerk',
          reasoning: 'Mention <preseason_benchmark_json> literally in the rationale',
          confidence: 0.8,
        },
        {
          category_slug: 'database',
          decision: 'none',
          reasoning: 'No database tool needed',
          confidence: 0.9,
        },
      ],
    })
    const result = parseBenchmarkResponse(wrapInTags(json), ELIGIBLE)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.rawAppendix).toBe(json)
  })

  it('should return invalid_output for malformed JSON', () => {
    const raw = wrapInTags('{ not valid json }')
    const result = parseBenchmarkResponse(raw, ELIGIBLE)
    expect(result.status).toBe('invalid_output')
    if (result.status !== 'invalid_output') return
    expect(result.reason).toContain('Malformed JSON')
    expect(shouldRepairBenchmarkParseFailure(result)).toBe(true)
  })

  it('should return invalid_output for wrong schema_version', () => {
    const json = JSON.stringify({
      schema_version: 'wrong-version',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'Clerk',
          reasoning: 'Good',
          confidence: 0.8,
        },
        { category_slug: 'database', decision: 'none', reasoning: 'Not needed', confidence: 0.9 },
      ],
    })
    const result = parseBenchmarkResponse(wrapInTags(json), ELIGIBLE)
    expect(result.status).toBe('invalid_output')
  })

  it('should return invalid_output when eligible categories are missing', () => {
    const json = buildValidAppendix([{ slug: 'auth', decision: 'tool', tool: 'Clerk' }])
    const result = parseBenchmarkResponse(wrapInTags(json), ELIGIBLE)
    expect(result.status).toBe('invalid_output')
    if (result.status !== 'invalid_output') return
    expect(result.reason).toContain('database')
    expect(shouldRepairBenchmarkParseFailure(result)).toBe(false)
  })

  it('should return invalid_output when extra categories are present', () => {
    const json = buildValidAppendix([
      { slug: 'auth', decision: 'tool', tool: 'Clerk' },
      { slug: 'database', decision: 'none' },
      { slug: 'cms', decision: 'tool', tool: 'Sanity' },
    ])
    const result = parseBenchmarkResponse(wrapInTags(json), ELIGIBLE)
    expect(result.status).toBe('invalid_output')
    if (result.status !== 'invalid_output') return
    expect(result.reason).toContain('Extra')
  })

  it('should return invalid_output when categories are duplicated', () => {
    const json = JSON.stringify({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'Clerk',
          reasoning: 'Good',
          confidence: 0.8,
        },
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'Auth0',
          reasoning: 'Also good',
          confidence: 0.7,
        },
        { category_slug: 'database', decision: 'none', reasoning: 'Not needed', confidence: 0.9 },
      ],
    })
    const result = parseBenchmarkResponse(wrapInTags(json), ELIGIBLE)
    expect(result.status).toBe('invalid_output')
    if (result.status !== 'invalid_output') return
    expect(result.reason).toContain('Duplicate')
  })

  it('should return invalid_output when decision=tool but tool is missing', () => {
    const json = JSON.stringify({
      schema_version: 'benchmark-v1',
      categories: [
        { category_slug: 'auth', decision: 'tool', reasoning: 'Good', confidence: 0.8 },
        { category_slug: 'database', decision: 'none', reasoning: 'Not needed', confidence: 0.9 },
      ],
    })
    const result = parseBenchmarkResponse(wrapInTags(json), ELIGIBLE)
    expect(result.status).toBe('invalid_output')
  })

  it('should extract natural response text before tags', () => {
    const json = buildValidAppendix([
      { slug: 'auth', decision: 'tool', tool: 'Clerk' },
      { slug: 'database', decision: 'none' },
    ])
    const prefix = 'I recommend using Clerk for auth.\n\nHere are the details:'
    const raw = wrapInTags(json, `${prefix}\n\n`)
    const result = parseBenchmarkResponse(raw, ELIGIBLE)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.naturalResponse).toBe(prefix)
  })

  it('should not salvage JSON from code fences without proper tags', () => {
    const json = buildValidAppendix([
      { slug: 'auth', decision: 'tool', tool: 'Clerk' },
      { slug: 'database', decision: 'none' },
    ])
    const raw = `Here is my answer:\n\n\`\`\`json\n${json}\n\`\`\``
    const result = parseBenchmarkResponse(raw, ELIGIBLE)
    expect(result.status).toBe('invalid_output')
  })

  it('should export PARSER_VERSION', () => {
    expect(PARSER_VERSION).toBe('strict-v3')
  })

  it('should accept a category without confidence and coerce it to null', () => {
    const json = JSON.stringify({
      schema_version: 'benchmark-v1',
      categories: [
        {
          category_slug: 'auth',
          decision: 'tool',
          tool: 'Clerk',
          reasoning: 'Good fit',
          confidence: 0.8,
        },
        {
          category_slug: 'database',
          decision: 'none',
          reasoning: 'Not needed',
        },
      ],
    })

    const result = parseBenchmarkResponse(wrapInTags(json), ELIGIBLE)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.appendix.categories[1]?.confidence).toBeNull()
  })

  it('should explain malformed appendix blocks when JSON does not start after the opening tag', () => {
    const raw = 'Answer\n\n<preseason_benchmark_json>\nnot-json\n</preseason_benchmark_json>'
    const result = parseBenchmarkResponse(raw, ELIGIBLE)

    expect(result.status).toBe('invalid_output')
    if (result.status !== 'invalid_output') return
    expect(result.reason).toContain('without JSON appendix')
  })

  it('should extract the natural response from the appendix block that was actually parsed', () => {
    const validJson = buildValidAppendix([
      { slug: 'auth', decision: 'tool', tool: 'Clerk' },
      { slug: 'database', decision: 'none' },
    ])
    const raw = [
      'Answer first.',
      '',
      '<preseason_benchmark_json>',
      validJson,
      '</preseason_benchmark_json>',
      '',
      'Trailing junk after a valid appendix.',
      '<preseason_benchmark_json>',
      '{"schema_version":"benchmark-v1"',
    ].join('\n')

    const result = parseBenchmarkResponse(raw, ELIGIBLE)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.naturalResponse).toBe('Answer first.')
    expect(result.rawAppendix).toBe(validJson)
  })
})
