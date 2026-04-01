import { describe, expect, it } from 'vitest'
import {
  buildMajorToolCatalog,
  buildMajorToolEvalTests,
  MAJOR_TOOL_EVAL_BROAD_PROVIDER_IDS,
  MAJOR_TOOL_EVAL_PROVIDER_IDS,
  selectMajorToolEvalPrompts,
} from './write-major-tool-eval-fixtures'

const samplePrompts = [
  {
    id: 'prompt-1',
    title: 'Build a SaaS app',
    slug: 'saas-application',
    level: 'intermediate' as const,
    isActive: true,
    expectedCategories: ['auth', 'database', 'payments'],
    rawPrompt: 'Build a SaaS app.',
    benchmarkPrompt: 'Benchmark SaaS prompt',
  },
  {
    id: 'prompt-2',
    title: 'Real Estate Website',
    slug: 'real-estate-website',
    level: 'intermediate' as const,
    isActive: true,
    expectedCategories: ['auth', 'database'],
    rawPrompt: 'Build a real estate website.',
    benchmarkPrompt: 'Benchmark real estate prompt',
  },
  {
    id: 'prompt-3',
    title: 'Blog Platform with CMS',
    slug: 'blog-platform-cms',
    level: 'advanced' as const,
    isActive: true,
    expectedCategories: ['cms', 'search'],
    rawPrompt: 'Build a CMS blog.',
    benchmarkPrompt: 'Benchmark CMS prompt',
  },
]

describe('selectMajorToolEvalPrompts', () => {
  it('returns the selected prompts in configured order', () => {
    const result = selectMajorToolEvalPrompts(samplePrompts)
    expect(result.map((prompt) => `${prompt.slug}/${prompt.level}`)).toEqual([
      'saas-application/intermediate',
      'real-estate-website/intermediate',
      'blog-platform-cms/advanced',
    ])
  })

  it('fails fast when a selected prompt is missing', () => {
    expect(() => selectMajorToolEvalPrompts(samplePrompts.slice(0, 2))).toThrow(
      'Missing selected eval prompt',
    )
  })
})

describe('buildMajorToolCatalog', () => {
  it('includes blocked generic phrases and known branded terms', () => {
    const result = buildMajorToolCatalog()
    expect(result.blockedExactPhrases).toContain('custom editorial application')
    expect(result.knownNormalizedTerms).toContain('stripe')
    expect(result.knownBrandTokens).toContain('supabase')
  })
})

describe('buildMajorToolEvalTests', () => {
  it('builds strict regression tests with external javascript assertions', () => {
    const result = buildMajorToolEvalTests(
      selectMajorToolEvalPrompts(samplePrompts),
      '/repo',
      '/repo/.context/promptfoo/major-tool-tool-catalog.json',
    )

    expect(result).toHaveLength(3)
    expect(result[0]?.threshold).toBe(1)
    expect(result[0]?.vars.prompt_text).toBe('Benchmark SaaS prompt')
    expect(result[0]?.vars.expected_categories).toBe(
      JSON.stringify(['auth', 'database', 'payments']),
    )
    expect(result[0]?.vars.tool_catalog_path).toBe(
      '/repo/.context/promptfoo/major-tool-tool-catalog.json',
    )
    expect(result[0]?.assert.some((assertion) => assertion.type === 'javascript')).toBe(true)
  })
})

describe('provider matrices', () => {
  it('keeps the broad matrix as a strict superset of the stable matrix', () => {
    expect(MAJOR_TOOL_EVAL_PROVIDER_IDS).toHaveLength(8)
    expect(MAJOR_TOOL_EVAL_BROAD_PROVIDER_IDS).toHaveLength(10)
    expect(
      MAJOR_TOOL_EVAL_BROAD_PROVIDER_IDS.slice(0, MAJOR_TOOL_EVAL_PROVIDER_IDS.length),
    ).toEqual(MAJOR_TOOL_EVAL_PROVIDER_IDS)
  })
})
