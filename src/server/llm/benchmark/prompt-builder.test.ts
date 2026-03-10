import { describe, expect, it } from 'vitest'
import { buildBenchmarkPrompt } from './prompt-builder'

describe('buildBenchmarkPrompt', () => {
  const contentMd = 'Build a SaaS application with user authentication and billing.'
  const categories = ['auth', 'database', 'payments']

  it('should include the original prompt content', () => {
    const result = buildBenchmarkPrompt(contentMd, categories)
    expect(result).toContain(contentMd)
  })

  it('should include preseason_benchmark_json tags', () => {
    const result = buildBenchmarkPrompt(contentMd, categories)
    expect(result).toContain('<preseason_benchmark_json>')
    expect(result).toContain('</preseason_benchmark_json>')
  })

  it('should include all eligible category slugs', () => {
    const result = buildBenchmarkPrompt(contentMd, categories)
    for (const slug of categories) {
      expect(result).toContain(`- ${slug}`)
    }
  })

  it('should include benchmark-v1 schema version', () => {
    const result = buildBenchmarkPrompt(contentMd, categories)
    expect(result).toContain('"schema_version": "benchmark-v1"')
  })

  it('should mention decision types tool and none', () => {
    const result = buildBenchmarkPrompt(contentMd, categories)
    expect(result).toContain('"tool"')
    expect(result).toContain('"none"')
  })

  it('should start with the original content', () => {
    const result = buildBenchmarkPrompt(contentMd, categories)
    expect(result.startsWith(contentMd)).toBe(true)
  })
})
