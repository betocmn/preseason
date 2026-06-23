import { describe, expect, it } from 'vitest'
import { PROMPTS, SUBCATEGORIES, TOOL_CATEGORY_ASSIGNMENTS, TOOLS } from './seed'

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }
  return [...duplicates]
}

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

  it('keeps the new llm devtool categories seeded with competitive coverage', () => {
    const countsByCategory = getUniqueToolCountByCategory()

    expect(countsByCategory.get('llm-coding-agents') ?? 0).toBeGreaterThanOrEqual(10)
    expect(countsByCategory.get('llm-observability') ?? 0).toBeGreaterThanOrEqual(7)
    expect(countsByCategory.get('llm-evals') ?? 0).toBeGreaterThanOrEqual(7)
  })

  it('keeps Vercel CI as an alias instead of a canonical tool', () => {
    expect(TOOLS.some((tool) => tool.slug === 'vercel-ci')).toBe(false)
    expect(TOOLS.find((tool) => tool.slug === 'vercel')?.aliases).toContain('Vercel CI')
  })
})

describe('seed catalog integrity', () => {
  it('has unique tool slugs and names', () => {
    expect(findDuplicates(TOOLS.map((tool) => tool.slug))).toEqual([])
    expect(findDuplicates(TOOLS.map((tool) => tool.name))).toEqual([])
  })

  it('has unique subcategory slugs and names', () => {
    expect(findDuplicates(SUBCATEGORIES.map((sub) => sub.slug))).toEqual([])
    expect(findDuplicates(SUBCATEGORIES.map((sub) => sub.name))).toEqual([])
  })

  it('resolves every tool-category assignment to a known tool and subcategory', () => {
    const toolSlugs = new Set(TOOLS.map((tool) => tool.slug))
    const categorySlugs = new Set(SUBCATEGORIES.map((sub) => sub.slug))

    for (const assignment of TOOL_CATEGORY_ASSIGNMENTS) {
      expect(toolSlugs.has(assignment.toolSlug), `unknown tool "${assignment.toolSlug}"`).toBe(true)
      expect(
        categorySlugs.has(assignment.categorySlug),
        `unknown category "${assignment.categorySlug}"`,
      ).toBe(true)
    }
  })

  it('exposes the new expansion categories with competitive coverage', () => {
    const uniqueToolsByCategory = new Map<string, Set<string>>()
    for (const assignment of TOOL_CATEGORY_ASSIGNMENTS) {
      const set = uniqueToolsByCategory.get(assignment.categorySlug) ?? new Set<string>()
      set.add(assignment.toolSlug)
      uniqueToolsByCategory.set(assignment.categorySlug, set)
    }

    for (const slug of [
      'backend-language',
      'backend-framework',
      'agent-frameworks',
      'agentic-web-search',
      'vector-db',
      'llm-gateway',
      'ai-code-review',
      'browser-automation',
    ]) {
      expect(uniqueToolsByCategory.get(slug)?.size ?? 0, `coverage for "${slug}"`).toBeGreaterThanOrEqual(6)
    }
  })

  it('renames Background Jobs and LLM Coding Agents while preserving their slugs', () => {
    const jobs = SUBCATEGORIES.find((sub) => sub.slug === 'jobs')
    const ade = SUBCATEGORIES.find((sub) => sub.slug === 'llm-coding-agents')

    expect(jobs?.name).toBe('Background Jobs / Queues')
    expect(ade?.name).toBe('Agentic IDE / ADEs')
  })
})
