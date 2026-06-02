import { sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '~/server/db/schema'
import { toolAliases, toolCandidates, toolCategories, tools } from '~/server/db/schema'
import { fingerprintToolText, normalizeToolText } from './tool-normalization'

export type ToolResolutionIndex = {
  byName: Map<string, string>
  bySlug: Map<string, string>
  byAlias: Map<string, string>
  byFingerprint: Map<string, Set<string>>
  byCategoryFingerprint: Map<string, Map<string, Set<string>>>
}

export type ResolvedTool = { status: 'resolved'; toolId: string } | { status: 'unresolved_tool' }

function addToolFingerprint(
  index: Map<string, Set<string>>,
  fingerprint: string,
  toolId: string,
): void {
  if (fingerprint.length === 0) return

  let toolIds = index.get(fingerprint)
  if (!toolIds) {
    toolIds = new Set<string>()
    index.set(fingerprint, toolIds)
  }

  toolIds.add(toolId)
}

function getUniqueResolvedToolId(toolIds: Set<string> | undefined): string | null {
  if (!toolIds || toolIds.size !== 1) {
    return null
  }

  return toolIds.values().next().value ?? null
}

function resolveToolFingerprint(
  rawToolName: string,
  suggestedCategoryId: string | null,
  index: ToolResolutionIndex,
): { toolId: string | null } {
  const fingerprint = fingerprintToolText(rawToolName)
  if (fingerprint.length === 0) {
    return { toolId: null }
  }

  if (suggestedCategoryId) {
    const categoryToolId = getUniqueResolvedToolId(
      index.byCategoryFingerprint.get(suggestedCategoryId)?.get(fingerprint),
    )
    if (categoryToolId) {
      return { toolId: categoryToolId }
    }
  }

  return {
    toolId: getUniqueResolvedToolId(index.byFingerprint.get(fingerprint)),
  }
}

async function upsertResolvedAlias(
  database: PostgresJsDatabase<typeof schema>,
  rawToolName: string,
  toolId: string,
): Promise<void> {
  const normalizedAlias = normalizeToolText(rawToolName)
  if (normalizedAlias.length === 0) {
    return
  }

  await database
    .insert(toolAliases)
    .values({
      toolId,
      alias: rawToolName,
      normalizedAlias,
      source: 'auto_resolver',
    })
    .onConflictDoNothing({
      target: toolAliases.normalizedAlias,
    })
}

export async function buildToolResolutionIndex(
  database: PostgresJsDatabase<typeof schema>,
): Promise<ToolResolutionIndex> {
  const [allTools, allAliases, allToolCategories] = await Promise.all([
    database.select({ id: tools.id, name: tools.name, slug: tools.slug }).from(tools),
    database
      .select({
        toolId: toolAliases.toolId,
        alias: toolAliases.alias,
        normalizedAlias: toolAliases.normalizedAlias,
      })
      .from(toolAliases),
    database
      .select({ toolId: toolCategories.toolId, categoryId: toolCategories.categoryId })
      .from(toolCategories),
  ])

  const byName = new Map<string, string>()
  const bySlug = new Map<string, string>()
  const byAlias = new Map<string, string>()
  const byFingerprint = new Map<string, Set<string>>()
  const byCategoryFingerprint = new Map<string, Map<string, Set<string>>>()
  const categoryIdsByToolId = new Map<string, string[]>()

  for (const toolCategory of allToolCategories) {
    const existingCategoryIds = categoryIdsByToolId.get(toolCategory.toolId)
    if (existingCategoryIds) {
      existingCategoryIds.push(toolCategory.categoryId)
    } else {
      categoryIdsByToolId.set(toolCategory.toolId, [toolCategory.categoryId])
    }
  }

  for (const tool of allTools) {
    const normalizedName = normalizeToolText(tool.name)
    const normalizedSlug = normalizeToolText(tool.slug)
    byName.set(normalizedName, tool.id)
    bySlug.set(normalizedSlug, tool.id)

    const fingerprints = new Set([fingerprintToolText(tool.name), fingerprintToolText(tool.slug)])
    const categoryIds = categoryIdsByToolId.get(tool.id) ?? []

    for (const fingerprint of fingerprints) {
      addToolFingerprint(byFingerprint, fingerprint, tool.id)

      for (const categoryId of categoryIds) {
        let categoryFingerprintIndex = byCategoryFingerprint.get(categoryId)
        if (!categoryFingerprintIndex) {
          categoryFingerprintIndex = new Map<string, Set<string>>()
          byCategoryFingerprint.set(categoryId, categoryFingerprintIndex)
        }

        addToolFingerprint(categoryFingerprintIndex, fingerprint, tool.id)
      }
    }
  }

  for (const alias of allAliases) {
    const normalizedAlias = normalizeToolText(alias.normalizedAlias)
    byAlias.set(normalizedAlias, alias.toolId)

    const aliasFingerprint = fingerprintToolText(alias.alias)
    addToolFingerprint(byFingerprint, aliasFingerprint, alias.toolId)

    const categoryIds = categoryIdsByToolId.get(alias.toolId) ?? []
    for (const categoryId of categoryIds) {
      let categoryFingerprintIndex = byCategoryFingerprint.get(categoryId)
      if (!categoryFingerprintIndex) {
        categoryFingerprintIndex = new Map<string, Set<string>>()
        byCategoryFingerprint.set(categoryId, categoryFingerprintIndex)
      }

      addToolFingerprint(categoryFingerprintIndex, aliasFingerprint, alias.toolId)
    }
  }

  return { byName, bySlug, byAlias, byFingerprint, byCategoryFingerprint }
}

export function resolveToolName(
  rawToolName: string,
  index: ToolResolutionIndex,
): { toolId: string | null } {
  const normalized = normalizeToolText(rawToolName)
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
  const exactMatch = resolveToolName(rawToolName, index)
  if (exactMatch.toolId) {
    return { status: 'resolved', toolId: exactMatch.toolId }
  }

  const fingerprintMatch = resolveToolFingerprint(rawToolName, suggestedCategoryId, index)
  if (fingerprintMatch.toolId) {
    await upsertResolvedAlias(database, rawToolName, fingerprintMatch.toolId)
    return { status: 'resolved', toolId: fingerprintMatch.toolId }
  }

  const normalizedName = normalizeToolText(rawToolName)

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
