import { eq } from 'drizzle-orm'
import { db } from '~/server/db'
import { categories, toolCategories, tools } from '~/server/db/schema'

const AUTO_CREATED_TOOL_DESCRIPTION = 'Auto-created from LLM response. Requires admin review.'

type DatabaseClient = typeof db

type CategoryRow = {
  id: string
  slug: string
  name: string
}

type ToolRow = {
  id: string
  name: string
  slug: string
  aliases: string[] | null
}

type ToolIndex = {
  exact: Map<string, string>
  candidates: Array<{
    toolId: string
    label: string
  }>
  slugSet: Set<string>
}

export type ParsedRecommendation = {
  toolId: string
  categoryId: string
  confidence: number | null
  reasoning: string | null
  rank: number
}

export type RecommendationCandidate = {
  category: string
  tool: string
  confidence?: number | null
  reasoning?: string | null
}

export type ParserOptions = {
  database?: DatabaseClient
}

function normalizeLoose(value: string) {
  return value.toLowerCase().trim().replace(/[`*~]/g, '').replace(/\s+/g, ' ')
}

function normalizeKey(value: string) {
  return normalizeLoose(value).replace(/[^a-z0-9]/g, '')
}

function normalizeCategorySlug(value: string) {
  return normalizeLoose(value)
    .replace(/[_/\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function parseConfidence(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0) return 0
    if (value > 1) return 1
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed)) {
      if (parsed < 0) return 0
      if (parsed > 1) return 1
      return parsed
    }
  }

  return null
}

function normalizeReasoning(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

function sanitizeToolName(tool: string) {
  return normalizeLoose(tool)
    .replace(/^['"“”‘’`]+|['"“”‘’`]+$/g, '')
    .replace(/\(.*\)$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(value: string) {
  return value
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function toSlug(value: string) {
  const normalized = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'tool'
}

function bigramSet(value: string) {
  const set = new Set<string>()

  if (value.length < 2) {
    set.add(value)
    return set
  }

  for (let index = 0; index < value.length - 1; index += 1) {
    set.add(value.slice(index, index + 2))
  }

  return set
}

function similarityScore(a: string, b: string) {
  if (!a || !b) {
    return 0
  }

  if (a === b) {
    return 1
  }

  if (a.includes(b) || b.includes(a)) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length)
  }

  const aBigrams = bigramSet(a)
  const bBigrams = bigramSet(b)

  let overlap = 0
  for (const gram of aBigrams) {
    if (bBigrams.has(gram)) {
      overlap += 1
    }
  }

  return (2 * overlap) / (aBigrams.size + bBigrams.size)
}

function buildToolIndex(toolRows: ToolRow[]): ToolIndex {
  const exact = new Map<string, string>()
  const candidates: ToolIndex['candidates'] = []
  const slugSet = new Set<string>()

  const addLabel = (toolId: string, label: string) => {
    const key = normalizeKey(label)
    if (!key) {
      return
    }

    exact.set(key, toolId)
    candidates.push({
      toolId,
      label: key,
    })
  }

  for (const tool of toolRows) {
    slugSet.add(tool.slug)

    addLabel(tool.id, tool.name)
    addLabel(tool.id, tool.slug)

    for (const alias of tool.aliases ?? []) {
      addLabel(tool.id, alias)
    }
  }

  return { exact, candidates, slugSet }
}

function findToolId(toolName: string, toolIndex: ToolIndex) {
  const normalized = normalizeKey(toolName)
  if (!normalized) {
    return null
  }

  const exactMatch = toolIndex.exact.get(normalized)
  if (exactMatch) {
    return exactMatch
  }

  let bestMatch: string | null = null
  let bestScore = 0

  for (const candidate of toolIndex.candidates) {
    const score = similarityScore(normalized, candidate.label)
    if (score > bestScore) {
      bestScore = score
      bestMatch = candidate.toolId
    }
  }

  return bestScore >= 0.72 ? bestMatch : null
}

function extractJsonObjects(input: string) {
  const results: string[] = []

  const fenceMatches = input.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)
  for (const match of fenceMatches) {
    const candidate = match[1]?.trim()
    if (candidate) {
      results.push(candidate)
    }
  }

  let depth = 0
  let startIndex = -1
  let inString = false
  let escaped = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (char === '"' && !escaped) {
      inString = !inString
    }

    if (char === '\\' && !escaped) {
      escaped = true
      continue
    }

    escaped = false

    if (inString) {
      continue
    }

    if (char === '{') {
      if (depth === 0) {
        startIndex = index
      }
      depth += 1
    }

    if (char === '}') {
      depth -= 1
      if (depth === 0 && startIndex >= 0) {
        results.push(input.slice(startIndex, index + 1))
        startIndex = -1
      }
    }
  }

  const trimmed = input.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    results.push(trimmed)
  }

  return Array.from(new Set(results))
}

function toCandidatesFromStructuredObject(value: unknown): RecommendationCandidate[] {
  if (!value || typeof value !== 'object') {
    return []
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => toCandidatesFromStructuredObject(entry))
  }

  const record = value as Record<string, unknown>

  if (Array.isArray(record.recommendations)) {
    const structuredRecommendations: RecommendationCandidate[] = []

    for (const entry of record.recommendations) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        continue
      }

      const recommendation = entry as Record<string, unknown>
      const category =
        typeof recommendation.category === 'string'
          ? recommendation.category
          : typeof recommendation.categorySlug === 'string'
            ? recommendation.categorySlug
            : null
      const tool =
        typeof recommendation.tool === 'string'
          ? recommendation.tool
          : typeof recommendation.toolName === 'string'
            ? recommendation.toolName
            : null

      if (!category || !tool) {
        continue
      }

      structuredRecommendations.push({
        category,
        tool,
        confidence: parseConfidence(recommendation.confidence),
        reasoning:
          normalizeReasoning(recommendation.reasoning) ?? normalizeReasoning(recommendation.reason),
      })
    }

    return structuredRecommendations
  }

  const category =
    typeof record.category === 'string'
      ? record.category
      : typeof record.categorySlug === 'string'
        ? record.categorySlug
        : null
  const tool =
    typeof record.tool === 'string'
      ? record.tool
      : typeof record.toolName === 'string'
        ? record.toolName
        : null

  if (!category || !tool) {
    return []
  }

  return [
    {
      category,
      tool,
      confidence: parseConfidence(record.confidence),
      reasoning: normalizeReasoning(record.reasoning) ?? normalizeReasoning(record.reason),
    },
  ]
}

function extractStructuredCandidates(rawContent: string): RecommendationCandidate[] {
  const candidates = extractJsonObjects(rawContent)

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      const extracted = toCandidatesFromStructuredObject(parsed)
      if (extracted.length > 0) {
        return extracted
      }
    } catch {}
  }

  return []
}

function cleanupLine(line: string) {
  return line
    .replace(/^\s*(?:[-*]|\d+[.)])\s*/, '')
    .replace(/^\|+|\|+$/g, '')
    .trim()
}

function splitToolAndReasoning(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return { tool: '', reasoning: null as string | null }
  }

  const delimiters = [' | ', ' - ', ', ']
  let splitIndex = -1
  let splitDelimiter = ''

  for (const delimiter of delimiters) {
    const index = trimmed.indexOf(delimiter)
    if (index <= 0) {
      continue
    }

    if (splitIndex < 0 || index < splitIndex) {
      splitIndex = index
      splitDelimiter = delimiter
    }
  }

  if (splitIndex < 0) {
    return { tool: trimmed, reasoning: null as string | null }
  }

  const tool = trimmed.slice(0, splitIndex).trim()
  const reasoning = trimmed.slice(splitIndex + splitDelimiter.length).trim()

  return {
    tool,
    reasoning: reasoning.length > 0 ? reasoning : null,
  }
}

function extractFromLine(line: string): RecommendationCandidate | null {
  const cleaned = cleanupLine(line)
  if (!cleaned) {
    return null
  }

  if (cleaned.includes('|')) {
    const columns = cleaned.split('|').map((entry) => entry.trim())
    if (columns.length >= 2) {
      const [rawCategory, rawTool, rawReasoning] = columns
      if (!rawCategory || !rawTool) {
        return null
      }

      if (normalizeCategorySlug(rawCategory) === 'category') {
        return null
      }

      const separatorRegex = /^-+$/
      if (
        separatorRegex.test(rawCategory.replace(/\s+/g, '')) ||
        separatorRegex.test(rawTool.replace(/\s+/g, ''))
      ) {
        return null
      }

      return {
        category: rawCategory,
        tool: rawTool,
        reasoning: rawReasoning ? rawReasoning.trim() : null,
      }
    }
  }

  const directMatch = cleaned.match(
    /^\*{0,2}\s*([a-z0-9][a-z0-9\s_\-/]+?)\s*\*{0,2}\s*(?::|=>|->|-)\s*(.+)$/i,
  )

  if (directMatch) {
    const [, rawCategory, rawToolWithReasoning] = directMatch
    if (!rawCategory || !rawToolWithReasoning) {
      return null
    }

    const { tool: rawTool, reasoning: rawReasoning } = splitToolAndReasoning(rawToolWithReasoning)
    if (!rawTool) {
      return null
    }

    return {
      category: rawCategory,
      tool: rawTool,
      reasoning: rawReasoning ? rawReasoning.trim() : null,
      confidence: parseConfidence(rawReasoning),
    }
  }

  return null
}

function extractForProseCandidates(rawContent: string) {
  const clauses = rawContent
    .split(/(?:\.(?=\s|$))|\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  const candidates: RecommendationCandidate[] = []

  for (const clause of clauses) {
    const proseMatch = clause.match(/^for\s+([a-z0-9][a-z0-9\s-]*),\s*(.+)$/i)
    if (!proseMatch) {
      continue
    }

    const [, rawCategory, toolWithReasoning] = proseMatch
    if (!rawCategory || !toolWithReasoning) {
      continue
    }

    const { tool: rawTool, reasoning: rawReasoning } = splitToolAndReasoning(toolWithReasoning)
    if (!rawTool) {
      continue
    }

    candidates.push({
      category: rawCategory,
      tool: rawTool,
      reasoning: rawReasoning ? rawReasoning.trim() : null,
      confidence: parseConfidence(rawReasoning),
    })
  }

  return candidates
}

function dedupeCandidates(candidates: RecommendationCandidate[]) {
  const seen = new Set<string>()
  const deduped: RecommendationCandidate[] = []

  for (const candidate of candidates) {
    const key = `${normalizeCategorySlug(candidate.category)}::${normalizeKey(candidate.tool)}`
    if (!key || seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(candidate)
  }

  return deduped
}

function extractProseCandidates(rawContent: string) {
  const lineCandidates = rawContent
    .split('\n')
    .map((line) => extractFromLine(line))
    .filter((line): line is RecommendationCandidate => line !== null)

  const proseCandidates = extractForProseCandidates(rawContent)

  return dedupeCandidates([...lineCandidates, ...proseCandidates])
}

export function extractRecommendationCandidates(rawContent: string): RecommendationCandidate[] {
  const trimmed = rawContent.trim()
  if (!trimmed) {
    return []
  }

  const structured = extractStructuredCandidates(trimmed)
  if (structured.length > 0) {
    return dedupeCandidates(structured)
  }

  return extractProseCandidates(trimmed)
}

function resolveCategoryId(categoryLookup: Map<string, string>, rawCategory: string) {
  const normalizedSlug = normalizeCategorySlug(rawCategory)
  if (!normalizedSlug) {
    return null
  }

  return categoryLookup.get(normalizedSlug) ?? categoryLookup.get(normalizeKey(rawCategory)) ?? null
}

async function createUnknownTool(
  database: DatabaseClient,
  toolName: string,
  categoryId: string,
  toolIndex: ToolIndex,
): Promise<string> {
  const normalizedName = sanitizeToolName(toolName)
  const displayName = titleCase(normalizedName || toolName.trim())

  const existingByName = await database
    .select({ id: tools.id })
    .from(tools)
    .where(eq(tools.name, displayName))

  if (existingByName[0]?.id) {
    return existingByName[0].id
  }

  const baseSlug = toSlug(displayName)
  let slug = baseSlug
  let suffix = 2

  while (toolIndex.slugSet.has(slug)) {
    slug = `${baseSlug}-${suffix}`
    suffix += 1
  }

  const insertedTools = await database
    .insert(tools)
    .values({
      name: displayName,
      slug,
      isVerified: false,
      description: AUTO_CREATED_TOOL_DESCRIPTION,
    })
    .returning({ id: tools.id, slug: tools.slug, name: tools.name })

  const insertedTool = insertedTools[0]
  if (!insertedTool) {
    throw new Error(`Failed to create tool for response value: ${toolName}`)
  }

  await database
    .insert(toolCategories)
    .values({
      toolId: insertedTool.id,
      categoryId,
      isPrimary: false,
    })
    .onConflictDoNothing()

  toolIndex.slugSet.add(insertedTool.slug)
  const normalized = normalizeKey(insertedTool.name)
  if (normalized) {
    toolIndex.exact.set(normalized, insertedTool.id)
    toolIndex.candidates.push({ toolId: insertedTool.id, label: normalized })
  }

  return insertedTool.id
}

async function ensureToolId(
  database: DatabaseClient,
  toolName: string,
  categoryId: string,
  toolIndex: ToolIndex,
) {
  const cleanedToolName = sanitizeToolName(toolName)
  const matchedToolId = findToolId(cleanedToolName, toolIndex)

  if (matchedToolId) {
    return matchedToolId
  }

  return createUnknownTool(database, cleanedToolName, categoryId, toolIndex)
}

function createCategoryLookup(categoryRows: CategoryRow[]) {
  const categoryLookup = new Map<string, string>()

  for (const category of categoryRows) {
    categoryLookup.set(normalizeCategorySlug(category.slug), category.id)
    categoryLookup.set(normalizeKey(category.name), category.id)
  }

  return categoryLookup
}

export async function parseRecommendations(
  rawContent: string,
  options: ParserOptions = {},
): Promise<ParsedRecommendation[]> {
  const database = options.database ?? db
  const candidates = extractRecommendationCandidates(rawContent)

  if (candidates.length === 0) {
    return []
  }

  const [categoryRows, toolRows] = await Promise.all([
    database
      .select({ id: categories.id, slug: categories.slug, name: categories.name })
      .from(categories),
    database
      .select({ id: tools.id, name: tools.name, slug: tools.slug, aliases: tools.aliases })
      .from(tools),
  ])

  const categoryLookup = createCategoryLookup(categoryRows)
  const toolIndex = buildToolIndex(toolRows)

  const parsedRecommendations: ParsedRecommendation[] = []
  const seenKeys = new Set<string>()

  for (const candidate of candidates) {
    const categoryId = resolveCategoryId(categoryLookup, candidate.category)
    if (!categoryId) {
      continue
    }

    const toolId = await ensureToolId(database, candidate.tool, categoryId, toolIndex)
    const uniqueKey = `${categoryId}:${toolId}`

    if (seenKeys.has(uniqueKey)) {
      continue
    }

    seenKeys.add(uniqueKey)

    parsedRecommendations.push({
      toolId,
      categoryId,
      confidence: parseConfidence(candidate.confidence),
      reasoning: normalizeReasoning(candidate.reasoning),
      rank: parsedRecommendations.length + 1,
    })
  }

  return parsedRecommendations
}

export const __private__ = {
  normalizeCategorySlug,
  normalizeKey,
  extractStructuredCandidates,
  extractProseCandidates,
  findToolId,
  createCategoryLookup,
}
