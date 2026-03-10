import { createHash } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '~/server/db/schema'
import {
  benchmarkPromptVersionCategories,
  benchmarkPromptVersions,
  prompts,
} from '~/server/db/schema'
import { buildGenerationSystemPrompt } from '~/server/llm/service/system-prompt'
import type { PromptLevel } from '~/server/llm/prompts'
import { isPromptLevel } from '~/server/llm/prompts'

type PromptTier = 'basic' | 'intermediate' | 'advanced'

export function classifyPromptTier(categoryCount: number): PromptTier {
  if (categoryCount <= 3) return 'basic'
  if (categoryCount <= 6) return 'intermediate'
  return 'advanced'
}

export async function freezePromptVersion(
  database: PostgresJsDatabase<typeof schema>,
  promptId: string,
  options: {
    tierOverride?: PromptTier
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

  const contentHash = createHash('sha256').update(prompt.contentMd).digest('hex')

  const existing = await database.query.benchmarkPromptVersions.findFirst({
    where: eq(benchmarkPromptVersions.contentHash, contentHash),
  })

  if (existing) {
    return existing
  }

  const latestVersion = await database
    .select({ version: benchmarkPromptVersions.version })
    .from(benchmarkPromptVersions)
    .where(eq(benchmarkPromptVersions.promptId, promptId))
    .orderBy(desc(benchmarkPromptVersions.version))
    .limit(1)

  const nextVersion = (latestVersion[0]?.version ?? 0) + 1

  const tier = options.tierOverride ?? classifyPromptTier(options.categoryIds.length)
  const level: PromptLevel = isPromptLevel(prompt.level) ? prompt.level : 'vibe-coder'
  const systemPromptSnapshot = buildGenerationSystemPrompt(level)

  const [version] = await database
    .insert(benchmarkPromptVersions)
    .values({
      promptId,
      slug: prompt.slug,
      level: prompt.level,
      version: nextVersion,
      tier,
      contentMd: prompt.contentMd,
      contentHash,
      systemPromptSnapshot,
      promptContractVersion: '1.0',
    })
    .returning()

  if (!version) {
    throw new Error('Failed to create prompt version')
  }

  if (options.categoryIds.length > 0) {
    await database.insert(benchmarkPromptVersionCategories).values(
      options.categoryIds.map((categoryId, i) => ({
        promptVersionId: version.id,
        categoryId,
        displayOrder: i + 1,
      })),
    )
  }

  return version
}
