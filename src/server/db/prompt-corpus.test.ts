import { describe, expect, it } from 'vitest'
import { PROMPT_CORPUS, PROMPT_LEVELS, PROMPT_SLUGS } from './prompt-corpus'

describe('PROMPT_CORPUS', () => {
  it('contains 54 prompt variants across all levels', () => {
    expect(PROMPT_CORPUS).toHaveLength(54)
  })

  it('contains 18 prompts for each level', () => {
    const countsByLevel = Object.fromEntries(
      PROMPT_LEVELS.map((level) => [
        level,
        PROMPT_CORPUS.filter((prompt) => prompt.level === level).length,
      ]),
    )

    expect(countsByLevel).toEqual({
      beginner: 18,
      intermediate: 18,
      advanced: 18,
    })
  })

  it('contains exactly one prompt per level for each slug', () => {
    for (const slug of PROMPT_SLUGS) {
      const variants = PROMPT_CORPUS.filter((prompt) => prompt.slug === slug)

      expect(variants).toHaveLength(3)
      expect(variants.map((prompt) => prompt.level).sort()).toEqual([...PROMPT_LEVELS].sort())
    }
  })

  it('keeps required fields populated for every prompt', () => {
    for (const prompt of PROMPT_CORPUS) {
      expect(prompt.description.trim().length).toBeGreaterThan(0)
      expect(prompt.contentMd.trim().length).toBeGreaterThan(0)
      expect(prompt.expectedCategories.length).toBeGreaterThan(0)
      expect(prompt.isActive).toBe(true)
    }
  })
})
