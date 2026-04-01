import { describe, expect, it } from 'vitest'
import { buildGenerationSystemPrompt } from './system-prompt'

describe('buildGenerationSystemPrompt', () => {
  it('keeps the level-specific persona', () => {
    const result = buildGenerationSystemPrompt('beginner')
    expect(result).toContain('a non-technical builder')
  })

  it('biases recommendations toward major tool decisions', () => {
    const result = buildGenerationSystemPrompt('advanced')
    expect(result).toContain('Recommend the major best-fit tools for the job')
    expect(result).toContain('Prefer high-leverage, category-defining choices')
    expect(result).toContain('materially shape the build')
  })

  it('discourages niche packages and low-signal add-ons', () => {
    const result = buildGenerationSystemPrompt('intermediate')
    expect(result).toContain('tiny libraries, plugins, themes')
    expect(result).toContain('prefer recommending no tool')
    expect(result).toContain('one-off plugins and long-tail add-ons usually are not')
  })
})
