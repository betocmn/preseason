import { afterEach, describe, expect, it, vi } from 'vitest'

async function importSubject() {
  return await import('./write-major-tool-eval-fixtures')
}

describe('loadPromptExports', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('./export-promptfoo')
  })

  it('falls back to prompt corpus exports when the database is unavailable', async () => {
    vi.doMock('./export-promptfoo', async () => {
      const actual =
        await vi.importActual<typeof import('./export-promptfoo')>('./export-promptfoo')
      return {
        ...actual,
        exportPromptfooPrompts: vi.fn().mockRejectedValue(
          Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
            code: 'ECONNREFUSED',
          }),
        ),
      }
    })

    const { loadPromptExports } = await importSubject()
    const result = await loadPromptExports()

    expect(result.source).toBe('prompt-corpus-fallback')
    expect(result.warning).toContain('ECONNREFUSED')
    expect(result.prompts.length).toBeGreaterThan(0)
  })

  it('rethrows prompt validation failures from the active database export', async () => {
    vi.doMock('./export-promptfoo', async () => {
      const actual =
        await vi.importActual<typeof import('./export-promptfoo')>('./export-promptfoo')
      return {
        ...actual,
        exportPromptfooPrompts: vi
          .fn()
          .mockRejectedValue(
            new Error('Prompt saas-application (intermediate) is missing content_md'),
          ),
      }
    })

    const { loadPromptExports } = await importSubject()

    await expect(loadPromptExports()).rejects.toThrow(
      'Prompt saas-application (intermediate) is missing content_md',
    )
  })
})
