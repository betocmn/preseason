import type { TRPCError } from '@trpc/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  categories,
  comments,
  criticProfiles,
  prompts,
  subcategories,
  toolCategories,
  tools,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { createTestCaller, seedUser } from '~/test/trpc'

describe('commentRouter', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  async function seedToolTarget() {
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
    const [authTool] = await db
      .insert(tools)
      .values([{ name: 'Clerk', slug: 'clerk' }])
      .returning()
    await db.insert(toolCategories).values({
      toolId: authTool?.id ?? '',
      categoryId: authCategory?.id ?? '',
      isPrimary: true,
    })
    const [dbTool] = await db
      .insert(tools)
      .values([{ name: 'Supabase', slug: 'supabase' }])
      .returning()
    await db.insert(toolCategories).values({
      toolId: dbTool?.id ?? '',
      categoryId: dbCategory?.id ?? '',
      isPrimary: true,
    })

    return { authTool, dbTool }
  }

  it('lists comments by target', async () => {
    const db = getTestDb()
    const criticUser = await seedUser({ role: 'critic' })
    const critic = (
      await db
        .insert(criticProfiles)
        .values({ slug: 'list-critic', userId: criticUser.profile?.id ?? '', isActive: true })
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

  it('paginates recent comments and excludes non-displayable targets', async () => {
    const db = getTestDb()
    const criticUser = await seedUser({ role: 'critic' })
    const critic = (
      await db
        .insert(criticProfiles)
        .values({
          slug: 'paginate-critic',
          userId: criticUser.profile?.id ?? '',
          isActive: true,
          verifiedAt: new Date(),
        })
        .returning()
    )[0]
    const [toolA, toolB] = await db
      .insert(tools)
      .values([
        { name: 'Tool A', slug: 'tool-a' },
        { name: 'Tool B', slug: 'tool-b' },
      ])
      .returning()

    await db.insert(comments).values([
      {
        criticId: critic?.id ?? '',
        targetType: 'tool',
        targetId: toolA?.id ?? '',
        content: 'Newest visible',
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
      },
      {
        criticId: critic?.id ?? '',
        targetType: 'tool',
        targetId: toolB?.id ?? '',
        content: 'Older visible',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        criticId: critic?.id ?? '',
        targetType: 'tool',
        targetId: crypto.randomUUID(),
        content: 'Hidden broken target',
        createdAt: new Date('2026-01-04T00:00:00.000Z'),
      },
    ])

    const caller = createTestCaller(null)
    const firstPage = await caller.comment.listRecent({ limit: 1, offset: 0 })
    const secondPage = await caller.comment.listRecent({ limit: 1, offset: 1 })

    expect(firstPage.total).toBe(2)
    expect(firstPage.items).toHaveLength(1)
    expect(firstPage.items[0]?.content).toBe('Newest visible')
    expect(secondPage.total).toBe(2)
    expect(secondPage.items).toHaveLength(1)
    expect(secondPage.items[0]?.content).toBe('Older visible')
  })

  it('enforces conflict-of-interest exclusions on create', async () => {
    const db = getTestDb()
    const { authTool, dbTool } = await seedToolTarget()

    const criticUser = await seedUser({ role: 'critic' })
    await db.insert(criticProfiles).values({
      slug: 'excluded-critic',
      userId: criticUser.profile?.id ?? '',
      isActive: true,
      verifiedAt: new Date(),
      excludedCategories: ['auth'],
    })

    const caller = createTestCaller(criticUser.authUser)
    await expect(
      caller.comment.create({
        targetType: 'tool',
        targetId: authTool?.id ?? '',
        content: 'Should fail',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)

    const allowed = await caller.comment.create({
      targetType: 'tool',
      targetId: dbTool?.id ?? '',
      content: 'Allowed',
    })
    if (!allowed) {
      throw new Error('Expected comment to be created')
    }
    expect(allowed.content).toBe('Allowed')
  })

  it('blocks unverified critics from creating comments', async () => {
    const db = getTestDb()
    const { dbTool } = await seedToolTarget()

    const criticUser = await seedUser({ role: 'critic' })
    await db.insert(criticProfiles).values({
      slug: 'unverified-critic',
      userId: criticUser.profile?.id ?? '',
      isActive: true,
      verifiedAt: null,
    })

    const caller = createTestCaller(criticUser.authUser)
    await expect(
      caller.comment.create({
        targetType: 'tool',
        targetId: dbTool?.id ?? '',
        content: 'Should fail',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)
  })

  it('allows critics to update/delete own comments only', async () => {
    const db = getTestDb()
    const { dbTool } = await seedToolTarget()
    const criticOneUser = await seedUser({ role: 'critic' })
    const criticTwoUser = await seedUser({ role: 'critic' })

    const criticOne = (
      await db
        .insert(criticProfiles)
        .values({ slug: 'critic-one', userId: criticOneUser.profile?.id ?? '', isActive: true })
        .returning()
    )[0]
    const criticTwo = (
      await db
        .insert(criticProfiles)
        .values({ slug: 'critic-two', userId: criticTwoUser.profile?.id ?? '', isActive: true })
        .returning()
    )[0]
    const ownComment = (
      await db
        .insert(comments)
        .values({
          criticId: criticOne?.id ?? '',
          targetType: 'tool',
          targetId: dbTool?.id ?? '',
          content: 'Mine',
        })
        .returning()
    )[0]
    const othersComment = (
      await db
        .insert(comments)
        .values({
          criticId: criticTwo?.id ?? '',
          targetType: 'tool',
          targetId: dbTool?.id ?? '',
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

  async function seedPromptTarget() {
    const db = getTestDb()
    const [group] = await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
      .returning()
    await db
      .insert(subcategories)
      .values([
        { name: 'Authentication', slug: 'auth', categoryId: group?.id ?? '' },
        { name: 'Database', slug: 'database', categoryId: group?.id ?? '' },
      ])
      .returning()
    const [prompt] = await db
      .insert(prompts)
      .values({
        title: 'Build a SaaS',
        slug: 'build-a-saas',
        level: 'beginner',
        expectedCategories: ['auth', 'database'],
      })
      .returning()
    return { prompt }
  }

  it('lists comments by prompt target', async () => {
    const db = getTestDb()
    const { prompt } = await seedPromptTarget()
    const criticUser = await seedUser({ role: 'critic' })
    const critic = (
      await db
        .insert(criticProfiles)
        .values({ slug: 'prompt-critic', userId: criticUser.profile?.id ?? '', isActive: true })
        .returning()
    )[0]

    await db.insert(comments).values({
      criticId: critic?.id ?? '',
      targetType: 'prompt',
      targetId: prompt?.id ?? '',
      content: 'Great prompt for testing',
    })

    const caller = createTestCaller(null)
    const result = await caller.comment.listByTarget({
      targetType: 'prompt',
      targetId: prompt?.id ?? '',
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.content).toBe('Great prompt for testing')
  })

  it('enforces conflict-of-interest exclusions for prompt targets', async () => {
    const db = getTestDb()
    const { prompt } = await seedPromptTarget()

    const criticUser = await seedUser({ role: 'critic' })
    await db.insert(criticProfiles).values({
      slug: 'prompt-excluded-critic',
      userId: criticUser.profile?.id ?? '',
      isActive: true,
      verifiedAt: new Date(),
      excludedCategories: ['auth'],
    })

    const caller = createTestCaller(criticUser.authUser)
    await expect(
      caller.comment.create({
        targetType: 'prompt',
        targetId: prompt?.id ?? '',
        content: 'Should fail due to auth exclusion',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<TRPCError>)
  })

  it('allows admin to delete any comment', async () => {
    const db = getTestDb()
    const { dbTool } = await seedToolTarget()
    const criticUser = await seedUser({ role: 'critic' })
    const adminUser = await seedUser({ role: 'admin' })

    const critic = (
      await db
        .insert(criticProfiles)
        .values({
          slug: 'admin-delete-critic',
          userId: criticUser.profile?.id ?? '',
          isActive: true,
        })
        .returning()
    )[0]
    const comment = (
      await db
        .insert(comments)
        .values({
          criticId: critic?.id ?? '',
          targetType: 'tool',
          targetId: dbTool?.id ?? '',
          content: 'Admin can remove',
        })
        .returning()
    )[0]

    const adminCaller = createTestCaller(adminUser.authUser)
    const deleted = await adminCaller.comment.delete({ id: comment?.id ?? '' })
    expect(deleted.success).toBe(true)
  })
})
