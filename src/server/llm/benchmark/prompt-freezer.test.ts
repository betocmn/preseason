import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  benchmarkPromptVersionCategories,
  benchmarkPromptVersions,
  categories,
  prompts,
  subcategories,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { classifyPromptTier, freezePromptVersion } from './prompt-freezer'

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error('Expected at least one row')
  return row
}

async function seedPromptWithContent(db: ReturnType<typeof getTestDb>) {
  return first(
    await db
      .insert(prompts)
      .values({
        title: 'Build a todo app',
        slug: 'build-todo-app',
        level: 'vibe-coder',
        contentMd: 'Build a simple todo application with task management.',
      })
      .returning(),
  )
}

async function seedCategories(db: ReturnType<typeof getTestDb>, count: number) {
  const group = first(
    await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
      .returning(),
  )

  const slugs = ['auth', 'database', 'orm', 'email', 'payments', 'storage', 'hosting', 'search']
  const ids: string[] = []

  for (let i = 0; i < count; i++) {
    const slug = slugs[i] ?? `cat-${i}`
    const sub = first(
      await db
        .insert(subcategories)
        .values({
          categoryId: group.id,
          name: slug,
          slug,
          displayOrder: i + 1,
        })
        .returning(),
    )
    ids.push(sub.id)
  }

  return ids
}

describe('classifyPromptTier', () => {
  it('should classify 1-3 categories as basic', () => {
    expect(classifyPromptTier(1)).toBe('basic')
    expect(classifyPromptTier(2)).toBe('basic')
    expect(classifyPromptTier(3)).toBe('basic')
  })

  it('should classify 4-6 categories as intermediate', () => {
    expect(classifyPromptTier(4)).toBe('intermediate')
    expect(classifyPromptTier(5)).toBe('intermediate')
    expect(classifyPromptTier(6)).toBe('intermediate')
  })

  it('should classify 7+ categories as advanced', () => {
    expect(classifyPromptTier(7)).toBe('advanced')
    expect(classifyPromptTier(8)).toBe('advanced')
  })
})

describe('freezePromptVersion', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('should create a prompt version with correct content hash', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)
    const categoryIds = await seedCategories(db, 2)

    const version = await freezePromptVersion(db, prompt.id, { categoryIds })

    const expectedHash = createHash('sha256')
      .update(prompt.contentMd ?? '')
      .digest('hex')
    expect(version.contentHash).toBe(expectedHash)
    expect(version.version).toBe(1)
    expect(version.tier).toBe('basic')
    expect(version.contentMd).toBe(prompt.contentMd)
    expect(version.slug).toBe(prompt.slug)
  })

  it('should deduplicate by content hash', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)
    const categoryIds = await seedCategories(db, 2)

    const v1 = await freezePromptVersion(db, prompt.id, { categoryIds })
    const v2 = await freezePromptVersion(db, prompt.id, { categoryIds })

    expect(v1.id).toBe(v2.id)
    expect(v1.contentHash).toBe(v2.contentHash)
  })

  it('should reject refreezing identical content with different categoryIds', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)
    const categoryIds = await seedCategories(db, 3)

    await freezePromptVersion(db, prompt.id, { categoryIds: categoryIds.slice(0, 2) })

    await expect(
      freezePromptVersion(db, prompt.id, { categoryIds: categoryIds.slice(1, 3) }),
    ).rejects.toThrow('different benchmark metadata')
  })

  it('should reject refreezing identical content with a different tier override', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)
    const categoryIds = await seedCategories(db, 2)

    await freezePromptVersion(db, prompt.id, { categoryIds })

    await expect(
      freezePromptVersion(db, prompt.id, {
        categoryIds,
        tierOverride: 'advanced',
      }),
    ).rejects.toThrow('different benchmark metadata')
  })

  it('should reject identical content frozen for a different prompt', async () => {
    const db = getTestDb()
    const firstPrompt = await seedPromptWithContent(db)
    const secondPrompt = first(
      await db
        .insert(prompts)
        .values({
          title: 'Build another todo app',
          slug: 'build-another-todo-app',
          level: 'vibe-coder',
          contentMd: 'Build a simple todo application with task management.',
        })
        .returning(),
    )
    const categoryIds = await seedCategories(db, 2)

    await freezePromptVersion(db, firstPrompt.id, { categoryIds })

    await expect(freezePromptVersion(db, secondPrompt.id, { categoryIds })).rejects.toThrow(
      'different prompt',
    )
  })

  it('should reject prompts without eligible categories', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)

    await expect(freezePromptVersion(db, prompt.id, { categoryIds: [] })).rejects.toThrow(
      'at least one eligible category',
    )
  })

  it('should auto-increment version number', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)
    const categoryIds = await seedCategories(db, 3)

    const v1 = await freezePromptVersion(db, prompt.id, { categoryIds })
    expect(v1.version).toBe(1)

    await db
      .update(prompts)
      .set({ contentMd: 'Updated content for version 2' })
      .where(eq(prompts.id, prompt.id))

    const v2 = await freezePromptVersion(db, prompt.id, { categoryIds })
    expect(v2.version).toBe(2)
  })

  it('should auto-classify tier based on category count', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)
    const categoryIds = await seedCategories(db, 5)

    const version = await freezePromptVersion(db, prompt.id, { categoryIds })
    expect(version.tier).toBe('intermediate')
  })

  it('should use tierOverride when provided', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)
    const categoryIds = await seedCategories(db, 2)

    const version = await freezePromptVersion(db, prompt.id, {
      categoryIds,
      tierOverride: 'advanced',
    })
    expect(version.tier).toBe('advanced')
  })

  it('should create prompt version category rows', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)
    const categoryIds = await seedCategories(db, 3)

    const version = await freezePromptVersion(db, prompt.id, { categoryIds })

    const pvCategories = await db
      .select()
      .from(benchmarkPromptVersionCategories)
      .where(eq(benchmarkPromptVersionCategories.promptVersionId, version.id))

    expect(pvCategories).toHaveLength(3)
    expect(pvCategories.map((c) => c.categoryId).sort()).toEqual([...categoryIds].sort())
  })

  it('should roll back the version when category insertion fails', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)
    const categoryIds = await seedCategories(db, 2)
    const duplicateCategoryId = first(categoryIds)

    await expect(
      freezePromptVersion(db, prompt.id, {
        categoryIds: [duplicateCategoryId, duplicateCategoryId],
      }),
    ).rejects.toThrow()

    const versions = await db
      .select()
      .from(benchmarkPromptVersions)
      .where(eq(benchmarkPromptVersions.promptId, prompt.id))

    expect(versions).toHaveLength(0)
  })

  it('should reject refreezing when prompt level has changed', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)
    const categoryIds = await seedCategories(db, 2)

    await freezePromptVersion(db, prompt.id, { categoryIds })

    await db
      .update(prompts)
      .set({ level: 'software-dev-experienced' })
      .where(eq(prompts.id, prompt.id))

    await expect(freezePromptVersion(db, prompt.id, { categoryIds })).rejects.toThrow(
      'different benchmark metadata',
    )
  })

  it('should throw when prompt has no contentMd', async () => {
    const db = getTestDb()
    const prompt = first(
      await db
        .insert(prompts)
        .values({
          title: 'No content prompt',
          slug: 'no-content',
          level: 'vibe-coder',
        })
        .returning(),
    )

    await expect(freezePromptVersion(db, prompt.id, { categoryIds: [] })).rejects.toThrow(
      'no contentMd',
    )
  })

  it('should throw when prompt not found', async () => {
    const db = getTestDb()
    await expect(
      freezePromptVersion(db, '00000000-0000-0000-0000-000000000000', { categoryIds: [] }),
    ).rejects.toThrow('Prompt not found')
  })

  it('should snapshot the system prompt', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)
    const categoryIds = await seedCategories(db, 2)

    const version = await freezePromptVersion(db, prompt.id, { categoryIds })

    const full = await db.query.benchmarkPromptVersions.findFirst({
      where: eq(benchmarkPromptVersions.id, version.id),
    })

    expect(full?.systemPromptSnapshot).toBeTruthy()
    expect(full?.systemPromptSnapshot).toContain('non-technical builder')
  })
})
