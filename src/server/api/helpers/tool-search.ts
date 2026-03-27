import { asc } from 'drizzle-orm'
import { fingerprintToolText, normalizeToolText } from '~/server/llm/benchmark/tool-normalization'
import { tools } from '~/server/db/schema'

type Database = typeof import('~/server/db').db

export type ToolSearchMatchType =
  | 'exact_name'
  | 'exact_slug'
  | 'exact_alias'
  | 'fingerprint'
  | 'substring'

export type ToolSearchCatalogTool = typeof tools.$inferSelect

export type ToolSearchCatalogEntry = ToolSearchCatalogTool & {
  toolAliases: Array<{
    alias: string
    normalizedAlias: string
  }>
  toolCategories: Array<{
    categoryId: string
  }>
}

export type RankedToolSearchResult = {
  tool: ToolSearchCatalogEntry
  matchType: ToolSearchMatchType
  score: number
  categoryBoosted: boolean
}

const CATEGORY_BOOST_SCORE = 25

export async function loadToolSearchCatalog(db: Database): Promise<ToolSearchCatalogEntry[]> {
  return db.query.tools.findMany({
    orderBy: [asc(tools.name)],
    with: {
      toolAliases: {
        columns: {
          alias: true,
          normalizedAlias: true,
        },
      },
      toolCategories: {
        columns: {
          categoryId: true,
          isPrimary: true,
        },
        with: {
          category: {
            with: {
              categoryGroup: true,
            },
          },
        },
      },
    },
  })
}

function scoreSubstringMatch(haystack: string, query: string): number {
  if (query.length === 0 || haystack.length === 0) return 0
  if (haystack.startsWith(query)) return 160
  if (haystack.includes(` ${query}`)) return 140
  if (haystack.includes(query)) return 120
  return 0
}

function getToolCategoryIds(tool: ToolSearchCatalogEntry): Set<string> {
  return new Set(tool.toolCategories.map((toolCategory) => toolCategory.categoryId))
}

function getRankedToolSearchResult(
  tool: ToolSearchCatalogEntry,
  query: string,
  categoryId?: string,
): RankedToolSearchResult | null {
  const normalizedQuery = normalizeToolText(query)
  const fingerprintQuery = fingerprintToolText(query)

  if (normalizedQuery.length === 0) {
    return null
  }

  const normalizedName = normalizeToolText(tool.name)
  const normalizedSlug = normalizeToolText(tool.slug)
  const normalizedAliases = tool.toolAliases.map((alias) => normalizeToolText(alias.alias))

  let matchType: ToolSearchMatchType | null = null
  let score = 0

  if (normalizedName === normalizedQuery) {
    matchType = 'exact_name'
    score = 500
  } else if (normalizedSlug === normalizedQuery) {
    matchType = 'exact_slug'
    score = 490
  } else if (normalizedAliases.includes(normalizedQuery)) {
    matchType = 'exact_alias'
    score = 480
  } else if (
    fingerprintQuery.length > 0 &&
    new Set([
      fingerprintToolText(tool.name),
      fingerprintToolText(tool.slug),
      ...tool.toolAliases.map((alias) => fingerprintToolText(alias.alias)),
    ]).has(fingerprintQuery)
  ) {
    matchType = 'fingerprint'
    score = 350
  } else {
    const substringScore = Math.max(
      scoreSubstringMatch(normalizedName, normalizedQuery),
      scoreSubstringMatch(normalizedSlug, normalizedQuery),
      ...normalizedAliases.map((alias) => scoreSubstringMatch(alias, normalizedQuery)),
    )

    if (substringScore === 0) {
      return null
    }

    matchType = 'substring'
    score = substringScore
  }

  const categoryBoosted = categoryId ? getToolCategoryIds(tool).has(categoryId) : false
  return {
    tool,
    matchType,
    score: score + (categoryBoosted ? CATEGORY_BOOST_SCORE : 0),
    categoryBoosted,
  }
}

export function rankToolSearchCatalog(
  catalog: ToolSearchCatalogEntry[],
  input: {
    query: string
    limit: number
    categoryId?: string
  },
): RankedToolSearchResult[] {
  const ranked = catalog
    .map((tool) => getRankedToolSearchResult(tool, input.query, input.categoryId))
    .filter((result): result is RankedToolSearchResult => result !== null)

  ranked.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    return left.tool.name.localeCompare(right.tool.name)
  })

  return ranked.slice(0, input.limit)
}

export function describeToolSearchMatch(
  result: RankedToolSearchResult,
  isUniqueTopMatch: boolean,
): string {
  switch (result.matchType) {
    case 'exact_name':
      return 'Exact name match'
    case 'exact_slug':
      return 'Exact slug match'
    case 'exact_alias':
      return 'Exact alias match'
    case 'fingerprint':
      return result.categoryBoosted
        ? 'Unique fingerprint match in suggested category'
        : 'Unique fingerprint match'
    case 'substring':
      if (result.categoryBoosted && isUniqueTopMatch) {
        return 'Best substring match in suggested category'
      }
      return 'Best substring match'
  }
}

export function stripToolSearchRelations(tool: ToolSearchCatalogEntry): ToolSearchCatalogTool {
  const { toolAliases: _toolAliases, toolCategories: _toolCategories, ...toolRecord } = tool
  return toolRecord
}
