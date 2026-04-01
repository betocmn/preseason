import { describe, expect, it } from 'vitest'
import {
  buildPromptfooRunConfig,
  extractPromptfooFailureSummaries,
  parseArgs,
  resolvePromptfooExitCode,
} from './run-major-tool-eval'

describe('parseArgs', () => {
  it('defaults to the strict provider matrix', () => {
    expect(parseArgs([])).toEqual({ mode: 'default' })
  })

  it('switches to the broad provider matrix', () => {
    expect(parseArgs(['--broad'])).toEqual({ mode: 'broad' })
  })

  it('fails fast on unknown arguments', () => {
    expect(() => parseArgs(['--wat'])).toThrow('Unknown argument')
  })
})

describe('buildPromptfooRunConfig', () => {
  it('builds the strict suite output paths', () => {
    expect(buildPromptfooRunConfig('/repo', 'default')).toEqual({
      configPath: '/repo/promptfooconfig.major-tools.yaml',
      resultsPath: '/repo/.context/promptfoo/major-tool-results.json',
      htmlPath: '/repo/.context/promptfoo/major-tool-results.html',
    })
  })

  it('builds the broad suite output paths', () => {
    expect(buildPromptfooRunConfig('/repo', 'broad')).toEqual({
      configPath: '/repo/promptfooconfig.major-tools-broad.yaml',
      resultsPath: '/repo/.context/promptfoo/major-tool-broad-results.json',
      htmlPath: '/repo/.context/promptfoo/major-tool-broad-results.html',
    })
  })
})

describe('extractPromptfooFailureSummaries', () => {
  it('summarizes the first failing assertion per eval row', () => {
    const result = extractPromptfooFailureSummaries({
      results: {
        results: [
          {
            success: false,
            provider: { id: 'openrouter:openai/gpt-5.4-mini' },
            vars: { prompt_slug: 'real-estate-website', prompt_level: 'intermediate' },
            error: 'Aggregate score 0.00 < 1 threshold',
            gradingResult: {
              componentResults: [
                { pass: true, reason: 'Assertion passed' },
                { pass: false, reason: 'Missing preseason benchmark appendix tags' },
              ],
            },
          },
        ],
      },
    })

    expect(result).toEqual([
      'openrouter:openai/gpt-5.4-mini real-estate-website/intermediate: Missing preseason benchmark appendix tags',
    ])
  })
})

describe('resolvePromptfooExitCode', () => {
  it('keeps the strict suite blocking on assertion failures', () => {
    expect(
      resolvePromptfooExitCode({
        mode: 'default',
        promptfooExitCode: 100,
        stats: { successes: 22, failures: 2, errors: 0 },
        hasResults: true,
      }),
    ).toBe(100)
  })

  it('lets the broad suite stay non-blocking on assertion-only failures', () => {
    expect(
      resolvePromptfooExitCode({
        mode: 'broad',
        promptfooExitCode: 100,
        stats: { successes: 23, failures: 7, errors: 0 },
        hasResults: true,
      }),
    ).toBe(0)
  })

  it('keeps the broad suite blocking when promptfoo reports runtime errors', () => {
    expect(
      resolvePromptfooExitCode({
        mode: 'broad',
        promptfooExitCode: 100,
        stats: { successes: 20, failures: 2, errors: 1 },
        hasResults: true,
      }),
    ).toBe(100)
  })
})
