import { describe, expect, it } from 'vitest'
import { normalizeToolText } from '~/server/llm/benchmark/tool-normalization'
import {
  buildToolReviewShortlist,
  rankToolSearchCatalog,
  type ToolSearchCatalogEntry,
} from './tool-search'

function makeCatalogTool(input: {
  id: string
  name: string
  slug: string
  aliases?: string[]
  categoryIds?: string[]
}): ToolSearchCatalogEntry {
  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    description: null,
    website: null,
    logoUrl: null,
    isVerified: false,
    providerUserId: null,
    createdAt: new Date('2026-03-28T00:00:00Z'),
    updatedAt: null,
    toolAliases: (input.aliases ?? []).map((alias) => ({
      alias,
      normalizedAlias: normalizeToolText(alias),
    })),
    toolCategories: (input.categoryIds ?? []).map((categoryId) => ({
      categoryId,
    })),
  }
}

describe('tool-search helpers', () => {
  it('shortlists branded long-form variants for ai review', () => {
    const catalog = [
      makeCatalogTool({
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Simple',
        slug: 'simple',
        categoryIds: ['ci-category'],
      }),
    ]

    const shortlist = buildToolReviewShortlist(catalog, {
      query: 'Simple Labs CI',
      categoryId: 'ci-category',
      limit: 5,
      minSimilarity: 0.45,
    })

    expect(shortlist[0]?.tool.slug).toBe('simple')
    expect(shortlist[0]?.matchType).toBe('token_overlap')
    expect(shortlist[0]?.similarity).toBeGreaterThanOrEqual(0.45)
  })

  it('excludes substring-only fragments from the ai review shortlist', () => {
    const catalog = [
      makeCatalogTool({
        id: '00000000-0000-0000-0000-000000000002',
        name: 'Supabase',
        slug: 'supabase',
      }),
    ]

    const shortlist = buildToolReviewShortlist(catalog, {
      query: 'base',
      limit: 5,
      minSimilarity: 0.2,
    })

    expect(shortlist).toEqual([])
  })

  it('keeps exact matches ahead of category-boosted fuzzy matches', () => {
    const catalog = [
      makeCatalogTool({
        id: '00000000-0000-0000-0000-000000000003',
        name: 'Flow State',
        slug: 'flow-state',
        categoryIds: ['state-category'],
      }),
      makeCatalogTool({
        id: '00000000-0000-0000-0000-000000000004',
        name: 'Queue Master',
        slug: 'queue-master',
        aliases: ['flow'],
        categoryIds: ['jobs-category'],
      }),
    ]

    const ranked = rankToolSearchCatalog(catalog, {
      query: 'flow',
      categoryId: 'state-category',
      limit: 5,
    })

    expect(ranked[0]?.tool.slug).toBe('queue-master')
    expect(ranked[0]?.matchType).toBe('exact_alias')
  })

  it('uses category bias to break fuzzy ties inside the shortlist', () => {
    const catalog = [
      makeCatalogTool({
        id: '00000000-0000-0000-0000-000000000005',
        name: 'Flow State',
        slug: 'flow-state',
        categoryIds: ['state-category'],
      }),
      makeCatalogTool({
        id: '00000000-0000-0000-0000-000000000006',
        name: 'Flow Jobs',
        slug: 'flow-jobs',
        categoryIds: ['jobs-category'],
      }),
    ]

    const shortlist = buildToolReviewShortlist(catalog, {
      query: 'Flow Platform',
      categoryId: 'state-category',
      limit: 5,
      minSimilarity: 0.3,
    })

    expect(shortlist[0]?.tool.slug).toBe('flow-state')
    expect(shortlist[1]?.tool.slug).toBe('flow-jobs')
  })
})
