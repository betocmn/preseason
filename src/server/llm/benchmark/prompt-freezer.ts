import { createHash } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '~/server/db/schema'
import {
  benchmarkPromptVersionCategories,
  benchmarkPromptVersions,
  prompts,
} from '~/server/db/schema'
import type { PromptLevel } from '~/server/llm/prompts'
import { isPromptLevel } from '~/server/llm/prompts'
import { buildGenerationSystemPrompt } from '~/server/llm/service/system-prompt'

function hasSameCategoryOrder(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  return left.every((categoryId, index) => categoryId === right[index])
}

export async function freezePromptVersion(
  database: PostgresJsDatabase<typeof schema>,
  promptId: string,
  options: {
    categoryIds: string[]
  },
) {
  const prompt = await database.query.prompts.findFirst({
    where: eq(prompts.id, promptId),
  })

  if (!prompt) {
    throw new Error(`Prompt not found: ${promptId}`)
  }

  if (!prompt.contentMd) {
    throw new Error(`Prompt ${promptId} has no contentMd`)
  }

  if (options.categoryIds.length === 0) {
    throw new Error(`Prompt ${promptId} must have at least one eligible category`)
  }

  const contentMd = prompt.contentMd
  const contentHash = createHash('sha256').update(contentMd).digest('hex')

  const existing = await database.query.benchmarkPromptVersions.findFirst({
    where: eq(benchmarkPromptVersions.contentHash, contentHash),
    with: {
      categories: {
        orderBy: (fields, { asc }) => [asc(fields.displayOrder)],
      },
    },
  })

  const level: PromptLevel = isPromptLevel(prompt.level) ? prompt.level : 'beginner'
  const systemPromptSnapshot = buildGenerationSystemPrompt(level)

  if (existing) {
    const existingCategoryIds = existing.categories.map((category) => category.categoryId)
    const samePrompt = existing.promptId === promptId
    const sameCategories = hasSameCategoryOrder(existingCategoryIds, options.categoryIds)
    const sameLevel = existing.level === prompt.level
    const sameSnapshot = existing.systemPromptSnapshot === systemPromptSnapshot

    if (samePrompt && sameCategories && sameLevel && sameSnapshot) {
      return existing
    }

    if (!samePrompt) {
      throw new Error(`Prompt content already frozen for a different prompt: ${existing.promptId}`)
    }

    throw new Error(
      `Prompt ${promptId} already has frozen content with different benchmark metadata`,
    )
  }

  return await database.transaction(async (tx) => {
    const latestVersion = await tx
      .select({ version: benchmarkPromptVersions.version })
      .from(benchmarkPromptVersions)
      .where(eq(benchmarkPromptVersions.promptId, promptId))
      .orderBy(desc(benchmarkPromptVersions.version))
      .limit(1)

    const nextVersion = (latestVersion[0]?.version ?? 0) + 1

    const [version] = await tx
      .insert(benchmarkPromptVersions)
      .values({
        promptId,
        slug: prompt.slug,
        level: prompt.level,
        version: nextVersion,
        contentMd,
        contentHash,
        systemPromptSnapshot,
        promptContractVersion: '1.0',
      })
      .returning()

    if (!version) {
      throw new Error('Failed to create prompt version')
    }

    await tx.insert(benchmarkPromptVersionCategories).values(
      options.categoryIds.map((categoryId, i) => ({
        promptVersionId: version.id,
        categoryId,
        displayOrder: i + 1,
      })),
    )

    return version
  })
}
