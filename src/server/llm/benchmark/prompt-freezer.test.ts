import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { serverSettings } from '~/constants/server-settings'
import {
  benchmarkPromptVersionCategories,
  benchmarkPromptVersions,
  categories,
  prompts,
  subcategories,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { freezePromptVersion } from './prompt-freezer'
import { buildBenchmarkPromptVersionHash } from './prompt-version-hash'

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
        level: 'beginner',
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

describe('freezePromptVersion', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

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

    const expectedHash = buildBenchmarkPromptVersionHash({
      contentMd: prompt.contentMd ?? '',
      level: prompt.level,
      systemPromptSnapshot:
        version.systemPromptSnapshot ??
        'Expected freezePromptVersion to snapshot the system prompt',
      promptContractVersion: serverSettings.benchmark.promptContractVersion,
    })
    expect(version.contentHash).toBe(expectedHash)
    expect(version.version).toBe(1)
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

  it('should reject identical content frozen for a different prompt', async () => {
    const db = getTestDb()
    const firstPrompt = await seedPromptWithContent(db)
    const secondPrompt = first(
      await db
        .insert(prompts)
        .values({
          title: 'Build another todo app',
          slug: 'build-another-todo-app',
          level: 'beginner',
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

  it('should create a new version when prompt level has changed', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)
    const categoryIds = await seedCategories(db, 2)

    const v1 = await freezePromptVersion(db, prompt.id, { categoryIds })

    await db.update(prompts).set({ level: 'advanced' }).where(eq(prompts.id, prompt.id))

    const v2 = await freezePromptVersion(db, prompt.id, { categoryIds })
    expect(v2.id).not.toBe(v1.id)
    expect(v2.level).toBe('advanced')
    expect(v2.version).toBe(2)
  })

  it('should create a new version when the prompt contract metadata changes', async () => {
    const db = getTestDb()
    const prompt = await seedPromptWithContent(db)
    const categoryIds = await seedCategories(db, 2)

    const legacySystemPromptSnapshot = 'You are a pragmatic software assistant helping a builder.'
    const legacyHash = buildBenchmarkPromptVersionHash({
      contentMd: prompt.contentMd ?? '',
      level: prompt.level,
      systemPromptSnapshot: legacySystemPromptSnapshot,
      promptContractVersion: '1.0',
    })

    const [legacyVersion] = await db
      .insert(benchmarkPromptVersions)
      .values({
        promptId: prompt.id,
        slug: prompt.slug,
        level: prompt.level,
        version: 1,
        contentMd: prompt.contentMd ?? '',
        contentHash: legacyHash,
        systemPromptSnapshot: legacySystemPromptSnapshot,
        promptContractVersion: '1.0',
      })
      .returning()

    if (!legacyVersion) {
      throw new Error('Expected legacy benchmark prompt version to be created')
    }

    await db.insert(benchmarkPromptVersionCategories).values(
      categoryIds.map((categoryId, index) => ({
        promptVersionId: legacyVersion.id,
        categoryId,
        displayOrder: index + 1,
      })),
    )

    const nextVersion = await freezePromptVersion(db, prompt.id, { categoryIds })

    expect(nextVersion.id).not.toBe(legacyVersion.id)
    expect(nextVersion.version).toBe(2)
    expect(nextVersion.promptContractVersion).toBe(serverSettings.benchmark.promptContractVersion)
    expect(nextVersion.systemPromptSnapshot).not.toBe(legacySystemPromptSnapshot)
  })

  it('should throw when prompt has no contentMd', async () => {
    const db = getTestDb()
    const prompt = first(
      await db
        .insert(prompts)
        .values({
          title: 'No content prompt',
          slug: 'no-content',
          level: 'beginner',
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
