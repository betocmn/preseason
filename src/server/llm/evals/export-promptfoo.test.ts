import { describe, expect, it } from 'vitest'
import {
  buildPromptfooExportDocument,
  toPromptfooPromptExport,
} from '~/server/llm/evals/export-promptfoo'

describe('toPromptfooPromptExport', () => {
  it('builds a benchmark-ready export from a DB prompt row', () => {
    const result = toPromptfooPromptExport({
      id: 'prompt-1',
      title: 'Build a SaaS app',
      slug: 'build-a-saas-app',
      level: 'beginner',
      contentMd: 'Build me a SaaS app.',
      expectedCategories: ['auth', 'database'],
      isActive: true,
    })

    expect(result.rawPrompt).toBe('Build me a SaaS app.')
    expect(result.expectedCategories).toEqual(['auth', 'database'])
    expect(result.benchmarkPrompt).toContain('Build me a SaaS app.')
    expect(result.benchmarkPrompt).toContain('<preseason_benchmark_json>')
    expect(result.benchmarkPrompt).toContain('auth')
    expect(result.benchmarkPrompt).toContain('database')
  })

  it('fails fast when prompt content is missing', () => {
    expect(() =>
      toPromptfooPromptExport({
        id: 'prompt-1',
        title: 'Build a SaaS app',
        slug: 'build-a-saas-app',
        level: 'beginner',
        contentMd: null,
        expectedCategories: ['auth'],
        isActive: true,
      }),
    ).toThrow('missing content_md')
  })

  it('fails fast when expected categories are missing', () => {
    expect(() =>
      toPromptfooPromptExport({
        id: 'prompt-1',
        title: 'Build a SaaS app',
        slug: 'build-a-saas-app',
        level: 'beginner',
        contentMd: 'Build me a SaaS app.',
        expectedCategories: null,
        isActive: true,
      }),
    ).toThrow('missing expected_categories')
  })
})

describe('buildPromptfooExportDocument', () => {
  it('sorts prompt rows and reports the prompt count', () => {
    const result = buildPromptfooExportDocument(
      [
        {
          id: 'prompt-2',
          title: 'Zeta prompt',
          slug: 'zeta',
          level: 'beginner',
          contentMd: 'Zeta',
          expectedCategories: ['auth'],
          isActive: true,
        },
        {
          id: 'prompt-1',
          title: 'Alpha prompt',
          slug: 'alpha',
          level: 'beginner',
          contentMd: 'Alpha',
          expectedCategories: ['database'],
          isActive: true,
        },
      ],
      '2026-03-12T00:00:00.000Z',
    )

    expect(result.generatedAt).toBe('2026-03-12T00:00:00.000Z')
    expect(result.promptCount).toBe(2)
    expect(result.prompts.map((prompt) => prompt.slug)).toEqual(['alpha', 'zeta'])
  })
})
