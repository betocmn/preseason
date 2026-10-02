import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  categories,
  criticProfiles,
  prompts,
  subcategories,
  tools,
  userProfiles,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import {
  getCriticMetadata,
  getMatchMetadata,
  getPromptMetadata,
  getRankingCategoryMetadata,
  getRankingGroupMetadata,
  getToolMetadata,
} from './public-metadata'

describe('public metadata lookups', () => {
  beforeAll(setupTestDatabase)
  beforeEach(cleanTestDatabase)
  afterAll(teardownTestDatabase)

  it('uses names only, respects category scope and matches the requested prompt level', async () => {
    const db = getTestDb()
    const [group] = await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools' })
      .returning()
    const [privateGroup] = await db
      .insert(categories)
      .values({ name: 'Private', slug: 'private' })
      .returning()
    if (!group || !privateGroup) throw new Error('Missing fixture groups')
    await db.insert(subcategories).values([
      { categoryId: group.id, name: 'Authentication', slug: 'auth' },
      { categoryId: privateGroup.id, name: 'Private category', slug: 'private-category' },
    ])
    await db.insert(tools).values([
      { name: 'Alpha', slug: 'metadata-alpha', description: 'Alpha description' },
      { name: 'Beta', slug: 'metadata-beta' },
    ])
    await db.insert(prompts).values([
      {
        title: 'Beginner',
        slug: 'metadata-prompt',
        level: 'beginner',
        description: 'Intro',
        contentMd: 'Long prompt content',
      },
      {
        title: 'Advanced',
        slug: 'metadata-prompt',
        level: 'advanced',
        description: 'Advanced description',
        contentMd: 'Different long content',
      },
    ])
    expect(await getRankingGroupMetadata('devtools', db)).toEqual({ name: 'Devtools' })
    expect(await getRankingGroupMetadata('private', db)).toBeNull()
    expect(await getRankingCategoryMetadata('devtools', 'auth', db)).toEqual({
      name: 'Authentication',
    })
    expect(await getRankingCategoryMetadata('devtools', 'private-category', db)).toBeNull()
    expect(await getRankingCategoryMetadata('private', 'private-category', db)).toBeNull()
    const match = { categorySlug: 'auth', toolASlug: 'metadata-alpha', toolBSlug: 'metadata-beta' }
    expect(await getMatchMetadata(match, db)).toEqual({
      category: { name: 'Authentication' },
      toolA: { name: 'Alpha', slug: 'metadata-alpha' },
      toolB: { name: 'Beta', slug: 'metadata-beta' },
    })
    expect(await getMatchMetadata({ ...match, categorySlug: 'private-category' }, db)).toEqual({
      category: null,
      toolA: null,
      toolB: null,
    })
    expect(await getToolMetadata('metadata-alpha', db)).toEqual({
      name: 'Alpha',
      description: 'Alpha description',
    })
    expect(await getPromptMetadata('metadata-prompt', 'advanced', db)).toEqual({
      title: 'Advanced',
      description: 'Advanced description',
    })
  })

  it('exposes only public profile labels for verified active critics', async () => {
    const db = getTestDb()
    const [user] = await db
      .insert(userProfiles)
      .values({
        id: crypto.randomUUID(),
        email: 'private@example.com',
        displayName: 'Reviewer',
        bio: 'Public bio',
      })
      .returning()
    if (!user) throw new Error('Missing fixture user')
    const [critic] = await db
      .insert(criticProfiles)
      .values({ userId: user.id, slug: 'metadata-critic' })
      .returning()
    if (!critic) throw new Error('Missing fixture critic')
    expect(await getCriticMetadata(critic.slug, db)).toBeNull()
    await db
      .update(criticProfiles)
      .set({ verifiedAt: new Date() })
      .where(eq(criticProfiles.id, critic.id))
    expect(await getCriticMetadata(critic.slug, db)).toEqual({
      displayName: 'Reviewer',
      bio: 'Public bio',
    })
    await db.update(criticProfiles).set({ isActive: false }).where(eq(criticProfiles.id, critic.id))
    expect(await getCriticMetadata(critic.slug, db)).toBeNull()
  })
})
