import { describe, expect, it } from 'vitest'
import { MATCH_PARSER_VERSION, parseMatchResponse } from './parser'

function buildValidMatchAppendix() {
  return JSON.stringify({
    schema_version: 'match-v2',
    winner: 'tool_a',
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
  })
}

function wrapInMatchTags(json: string, prefix = 'Here is my comparison.\n\n') {
  return `${prefix}<preseason_match_json>\n${json}\n</preseason_match_json>`
}

describe('parseMatchResponse', () => {
  it('should parse a valid response', () => {
    const json = buildValidMatchAppendix()
    const raw = wrapInMatchTags(json)
    const result = parseMatchResponse(raw)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.response.schema_version).toBe('match-v2')
    expect(result.response.winner).toBe('tool_a')
    expect(result.naturalResponse).toBe('Here is my comparison.')
    expect(result.rawAppendix).toBe(json)
  })

  it('should return invalid_output when tags are missing', () => {
    const result = parseMatchResponse('Just a plain response with no tags')
    expect(result.status).toBe('invalid_output')
    if (result.status !== 'invalid_output') return
    expect(result.reason).toContain('Missing')
  })

  it('should return invalid_output for malformed JSON', () => {
    const raw = wrapInMatchTags('{ invalid json }')
    const result = parseMatchResponse(raw)
    expect(result.status).toBe('invalid_output')
    if (result.status !== 'invalid_output') return
    expect(result.reason).toContain('Malformed JSON')
  })

  it('should return invalid_output for wrong schema_version', () => {
    const json = JSON.stringify({
      schema_version: 'wrong-v1',
      winner: 'tool_a',
      comparison_summary: 'Summary',
      tool_a: { pros: [], cons: [] },
      tool_b: { pros: [], cons: [] },
      confidence: 0.5,
    })
    const raw = wrapInMatchTags(json)
    const result = parseMatchResponse(raw)
    expect(result.status).toBe('invalid_output')
  })

  it('should extract natural response correctly', () => {
    const json = buildValidMatchAppendix()
    const raw = wrapInMatchTags(json, 'My detailed analysis is as follows.\n\n')
    const result = parseMatchResponse(raw)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.naturalResponse).toBe('My detailed analysis is as follows.')
  })

  it('should ignore closing tag mentions in the preamble', () => {
    const json = buildValidMatchAppendix()
    const raw = wrapInMatchTags(
      json,
      'Do not literally print </preseason_match_json> before the JSON.\n\n',
    )
    const result = parseMatchResponse(raw)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.rawAppendix).toBe(json)
  })

  it('should handle response with no preamble', () => {
    const json = buildValidMatchAppendix()
    const raw = wrapInMatchTags(json, '')
    const result = parseMatchResponse(raw)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.naturalResponse).toBe('')
  })

  it('should export MATCH_PARSER_VERSION', () => {
    expect(MATCH_PARSER_VERSION).toBe('match-strict-v1')
  })

  it('should handle JSON with nested braces in strings', () => {
    const json = JSON.stringify({
      schema_version: 'match-v2',
      winner: 'tool_a',
      comparison_summary: 'Tool A uses { config } syntax which is cleaner.',
      tool_a: {
        pros: [
          { phrase: 'Clean syntax', evidence_sentence: 'Uses { brackets } in config files.' },
        ],
        cons: [],
      },
      tool_b: { pros: [], cons: [] },
      confidence: 0.7,
    })
    const raw = wrapInMatchTags(json)
    const result = parseMatchResponse(raw)
    expect(result.status).toBe('ok')
  })
})
