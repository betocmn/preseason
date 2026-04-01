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

  it('should require reasoning and confidence for none decisions too', () => {
    const result = buildBenchmarkPrompt(contentMd, categories)
    expect(result).toContain('Every category entry must include both "reasoning" and "confidence"')
    expect(result).toContain('including "none" decisions')
  })

  it('should steer recommendations toward major tool choices', () => {
    const result = buildBenchmarkPrompt(contentMd, categories)
    expect(result).toContain('Favor major, category-defining tool choices')
    expect(result).toContain('materially affect architecture or workflow')
  })

  it('should tell models to use none for low-signal tool mentions', () => {
    const result = buildBenchmarkPrompt(contentMd, categories)
    expect(result).toContain('Use "none" instead of naming generic technologies')
    expect(result).toContain('custom-built/internal systems')
  })

  it('should instruct models to keep the natural-language answer brief', () => {
    const result = buildBenchmarkPrompt(contentMd, categories)
    expect(result).toContain('exactly 1 sentence maximum')
    expect(result).toContain('start the appendix immediately')
    expect(result).toContain('Do not end the response after the prose sentence')
    expect(result).toContain('you may omit prose entirely')
  })

  it('should forbid omitting the closing tag', () => {
    const result = buildBenchmarkPrompt(contentMd, categories)
    expect(result).toContain('Do not omit the closing tag')
  })

  it('should warn that alternate tags are forbidden and bad appendices are discarded', () => {
    const result = buildBenchmarkPrompt(contentMd, categories)
    expect(result).toContain('alternate tags are forbidden')
    expect(result).toContain('response will be discarded')
  })

  it('should start with the original content', () => {
    const result = buildBenchmarkPrompt(contentMd, categories)
    expect(result.startsWith(contentMd)).toBe(true)
  })
})
