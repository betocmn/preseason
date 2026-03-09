import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('normalizes accented characters', () => {
    expect(slugify('José Núñez')).toBe('jose-nunez')
  })

  it('falls back when the normalized slug would be empty', () => {
    expect(slugify('李雷', 'critic-123')).toBe('critic-123')
    expect(slugify('!!!', 'critic-456')).toBe('critic-456')
  })
})
