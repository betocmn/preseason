import { describe, expect, it, vi } from 'vitest'
import { serverSettings } from '~/constants/server-settings'
import type { LlmService } from '~/server/llm/service'
import type { CompletionRequest, CompletionResponse } from '~/server/llm/service/types'
import { MATCH_REPAIR_PARSER_VERSION, repairMatchResponse } from './repair'

function createMockLlmService(content: string) {
  const service = {
    complete: vi.fn(async (_provider: string, request: CompletionRequest) => {
      const response: CompletionResponse = {
        content,
        requestedModel: request.model,
        returnedModel: 'openai/gpt-5.4-mini',
        provider: 'openai',
        finishReason: 'stop',
        usage: { promptTokens: 100, completionTokens: 120, totalTokens: 220 },
        latencyMs: 400,
      }
      return response
    }),
    getProvider: vi.fn(),
  }

  return service as unknown as LlmService & { complete: ReturnType<typeof vi.fn> }
}

describe('repairMatchResponse', () => {
  it('should recover a valid appendix from raw model output', async () => {
    const llmService = createMockLlmService(
      JSON.stringify({
        schema_version: 'match-v2',
        winner: 'tool_a',
        comparison_summary: 'Tool A is a better fit.',
        tool_a: {
          pros: [{ phrase: 'Better DX', evidence_sentence: 'Tool A has the smoother workflow.' }],
          cons: [],
        },
        tool_b: {
          pros: [{ phrase: 'Lower cost', evidence_sentence: 'Tool B is cheaper.' }],
          cons: [],
        },
        confidence: 0.86,
      }),
    )

    const result = await repairMatchResponse(llmService, {
      promptContentMd: 'Compare Supabase vs Neon for Database.',
      parseFailureReason: 'Missing <preseason_match_json> tags',
      rawResponse: 'Supabase is the better default here because it is easier to ship with.',
    })

    expect(result.status).toBe('recovered')
    if (result.status !== 'recovered') return
    expect(result.response.winner).toBe('tool_a')
    expect(result.naturalResponse).toContain('Supabase is the better default')
    expect(result.repairModel).toBe('openai/gpt-5.4-mini')
    expect(llmService.complete).toHaveBeenCalledWith(
      'openai',
      expect.objectContaining({ timeoutMs: serverSettings.match.requestTimeoutMs }),
    )
  })

  it('should strip JSON code fences from the repair output', async () => {
    const llmService = createMockLlmService(`\`\`\`json
{"schema_version":"match-v2","winner":"tie","comparison_summary":"They are close.","tool_a":{"pros":[],"cons":[]},"tool_b":{"pros":[],"cons":[]},"confidence":0.5}
\`\`\``)

    const result = await repairMatchResponse(llmService, {
      promptContentMd: 'Compare Vercel vs Netlify for Hosting.',
      parseFailureReason: 'Malformed JSON',
      rawResponse: 'They are very close overall.',
    })

    expect(result.status).toBe('recovered')
    if (result.status !== 'recovered') return
    expect(result.response.winner).toBe('tie')
  })

  it('should report repair validation failures', async () => {
    const llmService = createMockLlmService(
      JSON.stringify({
        schema_version: 'match-v2',
        winner: 'Supabase',
        comparison_summary: 'Supabase wins.',
        tool_a: { pros: [], cons: [] },
        tool_b: { pros: [], cons: [] },
        confidence: 0.7,
      }),
    )

    const result = await repairMatchResponse(llmService, {
      promptContentMd: 'Compare Supabase vs Neon for Database.',
      parseFailureReason: 'Invalid enum value',
      rawResponse: 'Supabase wins.',
    })

    expect(result.status).toBe('failed')
    if (result.status !== 'failed') return
    expect(result.reason).toContain('Repair returned invalid appendix')
  })

  it('should skip repair for blank responses', async () => {
    const llmService = createMockLlmService('{}')

    const result = await repairMatchResponse(llmService, {
      promptContentMd: 'Compare Supabase vs Neon for Database.',
      parseFailureReason: 'Blank response',
      rawResponse: '   \n\t',
    })

    expect(result.status).toBe('failed')
    if (result.status !== 'failed') return
    expect(result.reason).toBe('Repair skipped for blank response')
    expect(llmService.complete).not.toHaveBeenCalled()
  })

  it('should export the match repair parser version', () => {
    expect(MATCH_REPAIR_PARSER_VERSION).toBe('match-repair-v2+repair-v1')
  })
})
