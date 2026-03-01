import type { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  categories,
  comments,
  criticProfiles,
  llms,
  prompts,
  recommendations,
  runResults,
  runs,
  subcategories,
  toolCategories,
  tools,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller, seedUser } from '~/test/trpc'

describe('commentRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  async function seedRecommendationTarget() {
    const db = getTestDb()
    const [group] = await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
      .returning()
    const [authCategory, dbCategory] = await db
      .insert(subcategories)
      .values([
        { name: 'Authentication', slug: 'auth', categoryId: group?.id ?? '' },
        { name: 'Database', slug: 'database', categoryId: group?.id ?? '' },
      ])
      .returning()
    const [tool] = await db
      .insert(tools)
      .values([{ name: 'Clerk', slug: 'clerk' }])
      .returning()
    await db.insert(toolCategories).values({
      toolId: tool?.id ?? '',
      categoryId: authCategory?.id ?? '',
      isPrimary: true,
    })
    const llm = (
      await db
        .insert(llms)
        .values({ name: 'GPT-4o', slug: 'gpt-4o', provider: 'OpenAI', modelId: 'openai/gpt-4o' })
        .returning()
    )[0]
    const prompt = (
      await db
        .insert(prompts)
        .values({ title: 'Prompt', slug: 'prompt', level: 'vibe-coder' })
        .returning()
    )[0]
    const run = (await db.insert(runs).values({ status: 'completed' }).returning())[0]
    const runResult = (
      await db
        .insert(runResults)
        .values({
          runId: run?.id ?? '',
          promptId: prompt?.id ?? '',
          llmId: llm?.id ?? '',
          parseStatus: 'success',
        })
        .returning()
    )[0]
    const [authRecommendation, dbRecommendation] = await db
      .insert(recommendations)
      .values([
        {
          runResultId: runResult?.id ?? '',
          toolId: tool?.id ?? '',
          categoryId: authCategory?.id ?? '',
        },
        {
          runResultId: runResult?.id ?? '',
          toolId: tool?.id ?? '',
          categoryId: dbCategory?.id ?? '',
        },
      ])
      .returning()

    return { tool, authRecommendation, dbRecommendation }
  }

  it('lists comments by target', async () => {
    const db = getTestDb()
    const criticUser = await seedUser({ role: 'critic' })
    const critic = (
      await db
        .insert(criticProfiles)
        .values({ userId: criticUser.profile?.id ?? '', isActive: true })
        .returning()
    )[0]
    const targetId = crypto.randomUUID()
    await db.insert(comments).values({
      criticId: critic?.id ?? '',
      targetType: 'tool',
      targetId,
      content: 'Good tool',
      isPinned: true,
    })

    const caller = createTestCaller(null)
    const result = await caller.comment.listByTarget({
      targetType: 'tool',
      targetId,
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.content).toBe('Good tool')
    expect(result[0]?.critic.user.id).toBe(criticUser.profile?.id)
    expect(result[0]?.critic.user).not.toHaveProperty('email')
  })

  it('enforces conflict-of-interest exclusions on create', async () => {
    const db = getTestDb()
    const { authRecommendation, dbRecommendation } = await seedRecommendationTarget()

    const criticUser = await seedUser({ role: 'critic' })
    await db.insert(criticProfiles).values({
      userId: criticUser.profile?.id ?? '',
      isActive: true,
      verifiedAt: new Date(),
      excludedCategories: ['auth'],
    })

    const caller = createTestCaller(criticUser.authUser)
    await expect(
      caller.comment.create({
        targetType: 'recommendation',
        targetId: authRecommendation?.id ?? '',
        content: 'Should fail',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)

    const allowed = await caller.comment.create({
      targetType: 'recommendation',
      targetId: dbRecommendation?.id ?? '',
      content: 'Allowed',
    })
    if (!allowed) {
      throw new Error('Expected comment to be created')
    }
    expect(allowed.content).toBe('Allowed')
  })

  it('blocks unverified critics from creating comments', async () => {
    const db = getTestDb()
    const { dbRecommendation } = await seedRecommendationTarget()

    const criticUser = await seedUser({ role: 'critic' })
    await db.insert(criticProfiles).values({
      userId: criticUser.profile?.id ?? '',
      isActive: true,
      verifiedAt: null,
    })

    const caller = createTestCaller(criticUser.authUser)
    await expect(
      caller.comment.create({
        targetType: 'recommendation',
        targetId: dbRecommendation?.id ?? '',
        content: 'Should fail',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)
  })

  it('allows critics to update/delete own comments only', async () => {
    const db = getTestDb()
    const target = await seedRecommendationTarget()
    const criticOneUser = await seedUser({ role: 'critic' })
    const criticTwoUser = await seedUser({ role: 'critic' })

    const criticOne = (
      await db
        .insert(criticProfiles)
        .values({ userId: criticOneUser.profile?.id ?? '', isActive: true })
        .returning()
    )[0]
    const criticTwo = (
      await db
        .insert(criticProfiles)
        .values({ userId: criticTwoUser.profile?.id ?? '', isActive: true })
        .returning()
    )[0]
    const ownComment = (
      await db
        .insert(comments)
        .values({
          criticId: criticOne?.id ?? '',
          targetType: 'recommendation',
          targetId: target.dbRecommendation?.id ?? '',
          content: 'Mine',
        })
        .returning()
    )[0]
    const othersComment = (
      await db
        .insert(comments)
        .values({
          criticId: criticTwo?.id ?? '',
          targetType: 'recommendation',
          targetId: target.dbRecommendation?.id ?? '',
          content: 'Not mine',
        })
        .returning()
    )[0]

    const caller = createTestCaller(criticOneUser.authUser)
    const updated = await caller.comment.update({
      id: ownComment?.id ?? '',
      content: 'Updated mine',
    })
    if (!updated) {
      throw new Error('Expected comment to be updated')
    }
    expect(updated.content).toBe('Updated mine')

    await expect(
      caller.comment.update({
        id: othersComment?.id ?? '',
        content: 'Blocked',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)

    const deleted = await caller.comment.delete({ id: ownComment?.id ?? '' })
    expect(deleted.success).toBe(true)
  })

  it('allows admin to delete any comment', async () => {
    const db = getTestDb()
    const target = await seedRecommendationTarget()
    const criticUser = await seedUser({ role: 'critic' })
    const adminUser = await seedUser({ role: 'admin' })

    const critic = (
      await db
        .insert(criticProfiles)
        .values({ userId: criticUser.profile?.id ?? '', isActive: true })
        .returning()
    )[0]
    const comment = (
      await db
        .insert(comments)
        .values({
          criticId: critic?.id ?? '',
          targetType: 'recommendation',
          targetId: target.dbRecommendation?.id ?? '',
          content: 'Admin can remove',
        })
        .returning()
    )[0]

    const adminCaller = createTestCaller(adminUser.authUser)
    const deleted = await adminCaller.comment.delete({ id: comment?.id ?? '' })
    expect(deleted.success).toBe(true)
  })
})
