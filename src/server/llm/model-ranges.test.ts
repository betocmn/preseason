import { describe, expect, it } from 'vitest'
import { CURATED_LLM_CATALOG, getCatalogLlmBySlug } from './catalog'
import { getModelRange, summarizeModelRanges } from './model-ranges'

function snapshot(slug: string) {
  const entry = getCatalogLlmBySlug(slug)
  if (!entry) throw new Error(`Missing catalog entry: ${slug}`)
  return { ...entry, requestedModelId: entry.modelId }
}

describe('model ranges', () => {
  it('keeps one active replacement per range and twenty active lines', () => {
    const entries = CURATED_LLM_CATALOG.filter((entry) => !entry.archived)
    expect(entries).toHaveLength(20)
    expect(new Set(entries.map((entry) => entry.range.id)).size).toBe(20)
  })

  it.each([
    ['gpt-5-4', 'gpt-6-astra'],
    ['gpt-5-3-codex', 'gpt-6-1-sol'],
    ['gpt-5-4-mini', 'gpt-6-luna'],
    ['deepseek-v3-2', 'deepseek-v4-1-flash'],
  ])('continues %s through %s', (oldSlug, newSlug) => {
    expect(getModelRange(snapshot(oldSlug)).id).toBe(getModelRange(snapshot(newSlug)).id)
  })

  it('does not include Flash history in Pro', () => {
    expect(getModelRange(snapshot('deepseek-v3-2')).id).not.toBe(
      getModelRange(snapshot('deepseek-v4-pro')).id,
    )
  })

  it('orders only the supplied measured versions and deduplicates snapshots', () => {
    const ranges = summarizeModelRanges([
      snapshot('claude-opus-4-8'),
      snapshot('claude-opus-4-6'),
      snapshot('claude-opus-4-8'),
    ])
    expect(ranges).toEqual([
      { id: 'anthropic-opus', name: 'Opus', company: 'Anthropic', label: 'Opus 4.6–4.8' },
    ])
  })

  it('uses the product-line name for a single measured version', () => {
    expect(summarizeModelRanges([snapshot('gpt-6-luna')])[0]?.label).toBe('GPT Mini')
  })

  it('isolates custom families by provider and naturally orders versions', () => {
    const base = {
      requestedModelId: 'custom/test',
      company: 'Custom',
      modelFamily: 'Custom',
      provider: 'custom',
    }
    expect(
      summarizeModelRanges([
        { ...base, modelVersion: '10' },
        { ...base, modelVersion: '2' },
      ])[0]?.label,
    ).toBe('Custom 2–10')
    expect(getModelRange({ ...base, modelVersion: '2', provider: 'another' }).id).not.toBe(
      getModelRange({ ...base, modelVersion: '2' }).id,
    )
  })
})
