import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { categories, subcategories, tools } from '~/server/db/schema'
import {
  __private__,
  extractRecommendationCandidates,
  parseRecommendations,
} from '~/server/llm/automation/parser'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'

describe('parser', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  async function seedGroup() {
    const database = getTestDb()
    const [group] = await database
      .insert(categories)
      .values([{ name: 'Devtools', slug: 'devtools', displayOrder: 1 }])
      .returning()
    return group
  }

  async function seedSubcategories(values: Array<{ name: string; slug: string }>) {
    const database = getTestDb()
    const group = await seedGroup()

    return database
      .insert(subcategories)
      .values(values.map((value) => ({ ...value, categoryId: group?.id ?? '' })))
      .returning()
  }

  it.each([
    {
      name: 'clean JSON payload',
      input:
        '{"recommendations":[{"category":"auth","tool":"Clerk","reasoning":"Good DX","confidence":0.91}]}',
      expectedLength: 1,
      expectedFirst: { category: 'auth', tool: 'Clerk' },
    },
    {
      name: 'markdown wrapped JSON payload',
      input:
        '```json\n{"recommendations":[{"category":"database","tool":"Supabase","confidence":0.85}]}\n```',
      expectedLength: 1,
      expectedFirst: { category: 'database', tool: 'Supabase' },
    },
    {
      name: 'single recommendation object',
      input: '{"category":"hosting","tool":"Vercel","reasoning":"Easy deploys"}',
      expectedLength: 1,
      expectedFirst: { category: 'hosting', tool: 'Vercel' },
    },
    {
      name: 'bullet prose extraction',
      input: '- auth: Clerk - confidence: 0.9\n- database: Supabase - managed postgres',
      expectedLength: 2,
      expectedFirst: { category: 'auth', tool: 'Clerk' },
    },
    {
      name: 'numbered prose extraction',
      input: '1. auth -> Clerk\n2. database -> Neon',
      expectedLength: 2,
      expectedFirst: { category: 'auth', tool: 'Clerk' },
    },
    {
      name: 'markdown table extraction',
      input:
        '| category | tool | reasoning |\n| --- | --- | --- |\n| auth | Clerk | simple auth |\n| database | Supabase | postgres |',
      expectedLength: 2,
      expectedFirst: { category: 'auth', tool: 'Clerk' },
    },
    {
      name: 'for prose extraction',
      input: 'For auth, Clerk. For database, Supabase.',
      expectedLength: 2,
      expectedFirst: { category: 'auth', tool: 'Clerk' },
    },
    {
      name: 'hyphenated tool names remain intact',
      input: '- auth: next-auth - battle tested',
      expectedLength: 1,
      expectedFirst: { category: 'auth', tool: 'next-auth' },
    },
    {
      name: 'json with duplicate entries gets deduped',
      input:
        '{"recommendations":[{"category":"auth","tool":"Clerk"},{"category":"auth","tool":"Clerk"}]}',
      expectedLength: 1,
      expectedFirst: { category: 'auth', tool: 'Clerk' },
    },
    {
      name: 'malformed json falls back to prose parsing',
      input: '{"recommendations":[{\n- auth: Clerk - fast\n- database: Supabase',
      expectedLength: 2,
      expectedFirst: { category: 'auth', tool: 'Clerk' },
    },
    {
      name: 'empty input returns no candidates',
      input: '   ',
      expectedLength: 0,
      expectedFirst: null,
    },
    {
      name: 'ignores non recommendation lines',
      input: 'I recommend this stack:\nThanks for reading',
      expectedLength: 0,
      expectedFirst: null,
    },
    {
      name: 'parses confidence from string in json',
      input:
        '{"recommendations":[{"category":"auth","tool":"Clerk","confidence":"0.7","reasoning":"popular"}]}',
      expectedLength: 1,
      expectedFirst: { category: 'auth', tool: 'Clerk' },
    },
    {
      name: 'accepts category with underscore by normalizing',
      input: '- ui_components: shadcn/ui - complete component kit',
      expectedLength: 1,
      expectedFirst: { category: 'ui_components', tool: 'shadcn/ui' },
    },
    {
      name: 'supports emphasized markdown keys',
      input: '- **auth**: Clerk - stable and easy',
      expectedLength: 1,
      expectedFirst: { category: 'auth', tool: 'Clerk' },
    },
  ])('$name', ({ input, expectedLength, expectedFirst }) => {
    const recommendations = extractRecommendationCandidates(input)

    expect(recommendations).toHaveLength(expectedLength)
    if (expectedFirst) {
      expect(recommendations[0]).toMatchObject(expectedFirst)
    }
  })

  it('normalizes category slugs and lookup keys', () => {
    expect(__private__.normalizeCategorySlug('UI Components')).toBe('ui-components')
    expect(__private__.normalizeCategorySlug(' monitoring_error ')).toBe('monitoring-error')
    expect(__private__.normalizeKey('Supabase Auth')).toBe('supabaseauth')
  })

  it('extracts multiple for clauses from a single line', () => {
    const recommendations = extractRecommendationCandidates(
      'For auth, Clerk. For database, Supabase.',
    )

    expect(recommendations).toHaveLength(2)
    expect(recommendations[0]).toMatchObject({ category: 'auth', tool: 'Clerk' })
    expect(recommendations[1]).toMatchObject({ category: 'database', tool: 'Supabase' })
  })

  it('maps category slugs and aliases to existing tool ids', async () => {
    const database = getTestDb()

    const [authCategory, databaseCategory] = await seedSubcategories([
      { name: 'Authentication', slug: 'auth' },
      { name: 'Database', slug: 'database' },
    ])

    const [clerk, supabase] = await database
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk', aliases: ['clerk auth'] },
        { name: 'Supabase', slug: 'supabase', aliases: ['supabase db'] },
      ])
      .returning()

    const parsed = await parseRecommendations(
      '{"recommendations":[{"category":"auth","tool":"clerk auth"},{"category":"database","tool":"supabase"}]}',
      { database },
    )

    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({
      categoryId: authCategory?.id,
      toolId: clerk?.id,
      rank: 1,
    })
    expect(parsed[1]).toMatchObject({
      categoryId: databaseCategory?.id,
      toolId: supabase?.id,
      rank: 2,
    })
  })

  it('creates unknown tools and marks them unverified for admin review', async () => {
    const database = getTestDb()

    const [authCategory] = await seedSubcategories([{ name: 'Authentication', slug: 'auth' }])

    const parsed = await parseRecommendations(
      '{"recommendations":[{"category":"auth","tool":"Authly"}]}',
      { database },
    )

    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.categoryId).toBe(authCategory?.id)

    const createdTool = await database.query.tools.findFirst({
      where: (table, { eq }) => eq(table.slug, 'authly'),
    })

    expect(createdTool).toBeTruthy()
    expect(createdTool?.isVerified).toBe(false)
    expect(createdTool?.description).toContain('Requires admin review')
  })

  it('fuzzy matches similar tool names', async () => {
    const database = getTestDb()

    const [databaseCategory] = await seedSubcategories([{ name: 'Database', slug: 'database' }])

    const [planetScale] = await database
      .insert(tools)
      .values([{ name: 'PlanetScale', slug: 'planetscale' }])
      .returning()

    const parsed = await parseRecommendations(
      '{"recommendations":[{"category":"database","tool":"Planet Scale"}]}',
      { database },
    )

    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toMatchObject({
      categoryId: databaseCategory?.id,
      toolId: planetScale?.id,
    })
  })

  it('ignores recommendations with unknown categories', async () => {
    const database = getTestDb()

    await seedSubcategories([{ name: 'Authentication', slug: 'auth' }])
    await database.insert(tools).values([{ name: 'Clerk', slug: 'clerk' }])

    const parsed = await parseRecommendations(
      '{"recommendations":[{"category":"unknown","tool":"Clerk"}]}',
      { database },
    )

    expect(parsed).toHaveLength(0)
  })

  it('returns ranked recommendations in order while deduping by category and tool', async () => {
    const database = getTestDb()

    await seedSubcategories([
      { name: 'Authentication', slug: 'auth' },
      { name: 'Database', slug: 'database' },
    ])

    await database
      .insert(tools)
      .values([
        { name: 'Clerk', slug: 'clerk' },
        { name: 'Supabase', slug: 'supabase' },
      ])
      .returning()

    const parsed = await parseRecommendations(
      '{"recommendations":[{"category":"auth","tool":"Clerk"},{"category":"auth","tool":"Clerk"},{"category":"database","tool":"Supabase"}]}',
      { database },
    )

    expect(parsed).toHaveLength(2)
    expect(parsed[0]?.rank).toBe(1)
    expect(parsed[1]?.rank).toBe(2)
  })

  it('returns no recommendations for malformed and non-parseable responses', async () => {
    const database = getTestDb()

    await seedSubcategories([{ name: 'Authentication', slug: 'auth' }])
    await database.insert(tools).values([{ name: 'Clerk', slug: 'clerk' }])

    const parsed = await parseRecommendations('### output\n```\nnot json\n```', { database })

    expect(parsed).toHaveLength(0)
  })
})
