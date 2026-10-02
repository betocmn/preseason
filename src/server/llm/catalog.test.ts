import { describe, expect, it } from 'vitest'
import { CURATED_LLM_CATALOG } from './catalog'

describe('CURATED_LLM_CATALOG', () => {
  it('has unique slugs', () => {
    const slugs = CURATED_LLM_CATALOG.map((entry) => entry.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('has unique model ids', () => {
    const modelIds = CURATED_LLM_CATALOG.map((entry) => entry.modelId)
    expect(new Set(modelIds).size).toBe(modelIds.length)
  })

  it('keeps the latest model versions active', () => {
    const activeSlugs = new Set(
      CURATED_LLM_CATALOG.filter((entry) => !entry.archived).map((entry) => entry.slug),
    )
    for (const slug of [
      'gpt-6-astra',
      'gpt-6-1-sol',
      'gpt-6-luna',
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'gemini-3-8-flash',
      'gemini-3-1-pro-preview',
      'glm-5-3',
      'minimax-m3',
      'mimo-v2-6-pro',
      'deepseek-v4-pro-0813',
      'deepseek-v4-1-flash',
      'kimi-k3',
    ]) {
      expect(activeSlugs.has(slug)).toBe(true)
    }
  })

  it('retains superseded models as archived rather than deleting them', () => {
    const archivedSlugs = new Set(
      CURATED_LLM_CATALOG.filter((entry) => entry.archived).map((entry) => entry.slug),
    )
    for (const slug of [
      'gpt-5-4',
      'claude-opus-4-6',
      'gemini-2-5-flash',
      'glm-5-turbo',
      'minimax-m2-7',
      'mimo-v2-pro',
      'deepseek-v3-2',
      'kimi-k2-5',
    ]) {
      expect(archivedSlugs.has(slug)).toBe(true)
    }
  })
})
