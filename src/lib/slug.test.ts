import { describe, expect, it } from 'vitest'
import { buildMatchSlug, slugify } from './slug'

describe('slugify', () => {
  it('normalizes accented characters', () => {
    expect(slugify('José Núñez')).toBe('jose-nunez')
  })

  it('falls back when the normalized slug would be empty', () => {
    expect(slugify('李雷', 'critic-123')).toBe('critic-123')
    expect(slugify('!!!', 'critic-456')).toBe('critic-456')
  })
})

describe('buildMatchSlug', () => {
  it('uses full date granularity', () => {
    const slug = buildMatchSlug('tool-a', 'tool-b', 'category', '2025-03-15')
    expect(slug).toBe('tool-a-vs-tool-b-category-2025-03-15')
  })

  it('truncates slugs exceeding 255 characters', () => {
    const longSlug = 'a'.repeat(200)
    const slug = buildMatchSlug(longSlug, longSlug, 'cat', '2025-03-15')
    expect(slug.length).toBeLessThanOrEqual(255)
    expect(slug).not.toMatch(/-$/)
  })
})
