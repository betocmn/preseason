import { eq, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '~/server/db/schema'
import { toolAliases, toolCandidates, tools } from '~/server/db/schema'

export type ToolResolutionIndex = {
  byName: Map<string, string>
  bySlug: Map<string, string>
  byAlias: Map<string, string>
}

export type ResolvedTool = { status: 'resolved'; toolId: string } | { status: 'unresolved_tool' }

export async function buildToolResolutionIndex(
  database: PostgresJsDatabase<typeof schema>,
): Promise<ToolResolutionIndex> {
  const [allTools, allAliases] = await Promise.all([
    database.select({ id: tools.id, name: tools.name, slug: tools.slug }).from(tools),
    database
      .select({ toolId: toolAliases.toolId, normalizedAlias: toolAliases.normalizedAlias })
      .from(toolAliases),
  ])

  const byName = new Map<string, string>()
  const bySlug = new Map<string, string>()
  const byAlias = new Map<string, string>()

  for (const tool of allTools) {
    byName.set(tool.name.toLowerCase().trim(), tool.id)
    bySlug.set(tool.slug.toLowerCase().trim(), tool.id)
  }

  for (const alias of allAliases) {
    byAlias.set(alias.normalizedAlias.toLowerCase().trim(), alias.toolId)
  }

  return { byName, bySlug, byAlias }
}

export function resolveToolName(
  rawToolName: string,
  index: ToolResolutionIndex,
): { toolId: string | null } {
  const normalized = rawToolName.toLowerCase().trim()
  const toolId =
    index.byName.get(normalized) ??
    index.bySlug.get(normalized) ??
    index.byAlias.get(normalized) ??
    null
  return { toolId }
}

export async function resolveToolWithCandidateQueue(
  database: PostgresJsDatabase<typeof schema>,
  rawToolName: string,
  index: ToolResolutionIndex,
  suggestedCategoryId: string | null,
): Promise<ResolvedTool> {
  const { toolId } = resolveToolName(rawToolName, index)
  if (toolId) {
    return { status: 'resolved', toolId }
  }

  const normalizedName = rawToolName.toLowerCase().trim()

  await database
    .insert(toolCandidates)
    .values({
      rawName: rawToolName,
      normalizedName,
      suggestedCategoryId,
      status: 'pending',
    })
    .onConflictDoUpdate({
      target: toolCandidates.normalizedName,
      set: {
        seenCount: sql`${toolCandidates.seenCount} + 1`,
        lastSeenAt: sql`now()`,
      },
    })

  return { status: 'unresolved_tool' }
}
