import { describe, expect, it } from 'vitest'
import { PROMPTS, TOOL_CATEGORY_ASSIGNMENTS, TOOLS } from './seed'

function getUniqueToolCountByCategory(): Map<string, number> {
  const toolSlugsByCategory = new Map<string, Set<string>>()

  for (const assignment of TOOL_CATEGORY_ASSIGNMENTS) {
    const existing = toolSlugsByCategory.get(assignment.categorySlug) ?? new Set<string>()
    existing.add(assignment.toolSlug)
    toolSlugsByCategory.set(assignment.categorySlug, existing)
  }

  return new Map(
    [...toolSlugsByCategory.entries()].map(([categorySlug, toolSlugs]) => [
      categorySlug,
      toolSlugs.size,
    ]),
  )
}

describe('seed catalog coverage', () => {
  it('covers every prompt-backed category with at least one seeded tool', () => {
    const countsByCategory = getUniqueToolCountByCategory()
    const promptBackedCategories = new Set(
      PROMPTS.flatMap((prompt) => prompt.expectedCategories ?? []),
    )

    for (const categorySlug of promptBackedCategories) {
      expect(
        countsByCategory.get(categorySlug) ?? 0,
        `Expected at least one seeded tool for "${categorySlug}"`,
      ).toBeGreaterThan(0)
    }
  })

  it('keeps state management seeded with at least five canonical tools', () => {
    const countsByCategory = getUniqueToolCountByCategory()

    expect(countsByCategory.get('state') ?? 0).toBeGreaterThanOrEqual(5)
  })

  it('keeps Vercel CI as an alias instead of a canonical tool', () => {
    expect(TOOLS.some((tool) => tool.slug === 'vercel-ci')).toBe(false)
    expect(TOOLS.find((tool) => tool.slug === 'vercel')?.aliases).toContain('Vercel CI')
  })
})
