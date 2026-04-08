import { pathToFileURL } from 'node:url'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { serverSettings } from '~/constants/server-settings'
import {
  AI_DEVTOOLS_MATCHUPS,
  AI_DEVTOOLS_SUBCATEGORIES,
  AI_DEVTOOLS_TOOL_CATEGORY_ASSIGNMENTS,
  AI_DEVTOOLS_TOOLS,
} from '~/server/db/ai-devtools-catalog'
import { buildPostgresClientOptions } from '~/server/db/connection-options'
import { PROMPT_CORPUS } from '~/server/db/prompt-corpus'
import * as schema from '~/server/db/schema'
import {
  benchmarkCases,
  benchmarkModelSnapshots,
  benchmarkProtocols,
  benchmarkSeasonModels,
  benchmarkSeasonPrompts,
  benchmarkSeasons,
  categories,
  llms,
  matchBatches,
  matchPromptTemplates,
  prompts,
  subcategories,
  toolAliases,
  toolCategories,
  tools,
  userProfiles,
} from '~/server/db/schema'
import { getOrCreateModelSnapshot } from '~/server/llm/benchmark/model-snapshotter'
import { freezePromptVersion } from '~/server/llm/benchmark/prompt-freezer'
import { isMatchEligibleRequestedModelId } from '~/server/llm/match/model-eligibility'

const SOURCE_ACTIVE_SEASON_SLUG = 'season-dev-1'
const TARGET_SEASON_SLUG = 'season-dev-2'
const TARGET_SEASON_NAME = 'Season dev-2'
const TARGET_PROTOCOL_SLUG = 'benchmark-v1'
const TARGET_MATCH_TEMPLATE_SLUG = 'balanced-comparison-v1'
const DEVTOOLS_GROUP_SLUG = 'devtools'
const TARGET_PROMPT_SLUGS = new Set(['ai-support-agent-platform', 'ai-revenue-ops-copilot'])
const ROLLOUT_TAG = 'llm-devtools-rollout'
const ROLLOUT_DATE = '2026-04-09'

function createDatabase(databaseUrl: string) {
  const sqlClient = postgres(databaseUrl, buildPostgresClientOptions(databaseUrl))
  const database = drizzle(sqlClient, { schema })
  return { sqlClient, database }
}

type DatabaseClient = ReturnType<typeof createDatabase>['database']

type Args = {
  databaseUrl: string
  execute: boolean
}

type Action = 'create' | 'update' | 'noop'

type ActionSummary = {
  created: number
  updated: number
  unchanged: number
}

type PreflightState = {
  protocol: typeof benchmarkProtocols.$inferSelect
  matchTemplate: typeof matchPromptTemplates.$inferSelect
  adminUser: typeof userProfiles.$inferSelect
  devtoolsGroup: typeof categories.$inferSelect
  activeBenchmarkSeasons: Array<typeof benchmarkSeasons.$inferSelect>
  targetSeason: typeof benchmarkSeasons.$inferSelect | null
}

type DryRunSummary = {
  mode: 'dry-run'
  currentActiveSeasonSlug: string | null
  targetSeasonSlug: string
  targetSeasonExists: boolean
  categoryActions: ActionSummary
  toolActions: ActionSummary
  promptActions: ActionSummary
  toolCategoryActions: ActionSummary
  aliasActions: {
    create: number
    unchanged: number
  }
  preExistingToolSlugs: string[]
  activePromptCountBefore: number
  activePromptCountAfter: number
  activeModelCount: number
  estimatedDailyCaseCount: number
  matchEligibleModelCount: number
  plannedMatchBatchCount: number
  estimatedMatchEvaluations: number
  plannedMatchups: string[]
}

type ExecuteSummary = {
  mode: 'execute'
  currentActiveSeasonSlugBefore: string | null
  activeSeasonSlugAfter: string
  completedSeasonSlug: string | null
  targetSeasonId: string
  categoryActions: ActionSummary
  toolActions: ActionSummary
  promptActions: ActionSummary
  toolCategoryActions: ActionSummary
  aliasActions: {
    create: number
    unchanged: number
  }
  seasonAction: 'created' | 'reused-draft' | 'reused-active'
  freezeResult: {
    promptVersionCount: number
    modelSnapshotCount: number
    caseCount: number
  }
  frozenCategorySlugs: string[]
  matchBatchCount: number
  totalMatchEvaluations: number
  matchBatchStatuses: string[]
}

const SCRIPT_SUPABASE_URL = 'https://example.supabase.co'
const SCRIPT_SUPABASE_ANON_KEY = 'placeholder-anon-key'

function parseArgs(argv: string[]): Args {
  let databaseUrl: string | null = null
  let execute = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg) {
      continue
    }
    if (arg === '--execute') {
      execute = true
      continue
    }
    if (arg === '--database-url') {
      databaseUrl = argv[i + 1] ?? null
      i += 1
      continue
    }
    if (arg.startsWith('--database-url=')) {
      databaseUrl = arg.slice('--database-url='.length)
    }
  }

  if (!databaseUrl) {
    throw new Error('Missing required --database-url argument')
  }

  return { databaseUrl, execute }
}

export function configureRuntimeEnv(args: Args) {
  // Force env-dependent imports to use the CLI-selected database instead of inherited shell state.
  process.env.DATABASE_URL = args.databaseUrl
  process.env.NEXT_PUBLIC_SUPABASE_URL = SCRIPT_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = SCRIPT_SUPABASE_ANON_KEY
}

function normalizeAlias(alias: string) {
  return alias.trim().toLowerCase()
}

function arraysEqual(left: string[] | null | undefined, right: string[] | null | undefined) {
  const normalizedLeft = left ?? []
  const normalizedRight = right ?? []

  if (normalizedLeft.length !== normalizedRight.length) return false
  return normalizedLeft.every((value, index) => value === normalizedRight[index])
}

function summarizeActions(actions: Action[]): ActionSummary {
  return actions.reduce<ActionSummary>(
    (summary, action) => {
      if (action === 'create') summary.created += 1
      if (action === 'update') summary.updated += 1
      if (action === 'noop') summary.unchanged += 1
      return summary
    },
    { created: 0, updated: 0, unchanged: 0 },
  )
}

function buildBatchIdempotencyKey(categorySlug: string, toolASlug: string, toolBSlug: string) {
  return [ROLLOUT_TAG, ROLLOUT_DATE, TARGET_SEASON_SLUG, categorySlug, toolASlug, toolBSlug].join(
    ':',
  )
}

function getTargetPromptRows() {
  const targetRows = PROMPT_CORPUS.filter((prompt) => TARGET_PROMPT_SLUGS.has(prompt.slug))
  if (targetRows.length !== 6) {
    throw new Error(`Expected 6 target prompts, found ${targetRows.length}`)
  }
  return targetRows
}

async function loadPreflightState(database: DatabaseClient): Promise<PreflightState> {
  const protocol = await database.query.benchmarkProtocols.findFirst({
    where: eq(benchmarkProtocols.slug, TARGET_PROTOCOL_SLUG),
  })
  if (!protocol) {
    throw new Error(`Benchmark protocol not found: ${TARGET_PROTOCOL_SLUG}`)
  }

  const activeBenchmarkSeasons = await database.query.benchmarkSeasons.findMany({
    where: eq(benchmarkSeasons.status, 'active'),
    orderBy: [desc(benchmarkSeasons.createdAt), desc(benchmarkSeasons.id)],
  })

  const targetSeason =
    (await database.query.benchmarkSeasons.findFirst({
      where: eq(benchmarkSeasons.slug, TARGET_SEASON_SLUG),
      orderBy: [desc(benchmarkSeasons.createdAt)],
    })) ?? null

  if (targetSeason && targetSeason.protocolId !== protocol.id) {
    throw new Error(`Target season ${TARGET_SEASON_SLUG} is attached to a different protocol`)
  }

  if (targetSeason && targetSeason.name !== TARGET_SEASON_NAME) {
    throw new Error(`Target season ${TARGET_SEASON_SLUG} already exists with a different name`)
  }

  const resumingFromTarget = targetSeason?.status === 'active'
  if (!resumingFromTarget) {
    if (activeBenchmarkSeasons.length !== 1) {
      throw new Error(
        `Expected exactly one active benchmark season before rollout, found ${activeBenchmarkSeasons.length}`,
      )
    }

    const currentActiveSeason = activeBenchmarkSeasons[0]
    if (!currentActiveSeason || currentActiveSeason.slug !== SOURCE_ACTIVE_SEASON_SLUG) {
      throw new Error(
        `Expected active benchmark season ${SOURCE_ACTIVE_SEASON_SLUG}, found ${currentActiveSeason?.slug ?? 'none'}`,
      )
    }
  } else {
    const unexpectedActiveSeasons = activeBenchmarkSeasons.filter(
      (season) => season.slug !== TARGET_SEASON_SLUG && season.slug !== SOURCE_ACTIVE_SEASON_SLUG,
    )
    if (unexpectedActiveSeasons.length > 0) {
      throw new Error(
        `Unexpected active benchmark seasons during resume: ${unexpectedActiveSeasons.map((season) => season.slug).join(', ')}`,
      )
    }
  }

  if (targetSeason && !['draft', 'active'].includes(targetSeason.status)) {
    throw new Error(
      `Target season ${TARGET_SEASON_SLUG} exists with unsupported status ${targetSeason.status}`,
    )
  }

  const matchTemplate = await database.query.matchPromptTemplates.findFirst({
    where: eq(matchPromptTemplates.isActive, true),
    orderBy: [desc(matchPromptTemplates.createdAt)],
  })
  if (!matchTemplate) {
    throw new Error('No active match prompt template found')
  }
  if (matchTemplate.slug !== TARGET_MATCH_TEMPLATE_SLUG) {
    throw new Error(
      `Expected active match prompt template ${TARGET_MATCH_TEMPLATE_SLUG}, found ${matchTemplate.slug}`,
    )
  }

  const adminUser = await database.query.userProfiles.findFirst({
    where: eq(userProfiles.role, 'admin'),
    orderBy: [asc(userProfiles.createdAt), asc(userProfiles.email)],
  })
  if (!adminUser) {
    throw new Error('No admin user found')
  }

  const devtoolsGroup = await database.query.categories.findFirst({
    where: eq(categories.slug, DEVTOOLS_GROUP_SLUG),
  })
  if (!devtoolsGroup) {
    throw new Error(`Category group not found: ${DEVTOOLS_GROUP_SLUG}`)
  }

  return {
    protocol,
    matchTemplate,
    adminUser,
    devtoolsGroup,
    activeBenchmarkSeasons,
    targetSeason,
  }
}

async function inspectCategoryActions(database: DatabaseClient, groupId: string) {
  const rows = await database.query.subcategories.findMany({
    where: inArray(
      subcategories.slug,
      AI_DEVTOOLS_SUBCATEGORIES.map((subcategory) => subcategory.slug),
    ),
  })
  const bySlug = new Map(rows.map((row) => [row.slug, row]))
  const actions: Action[] = []

  for (const desired of AI_DEVTOOLS_SUBCATEGORIES) {
    const existing = bySlug.get(desired.slug)
    if (!existing) {
      actions.push('create')
      continue
    }

    const needsUpdate =
      existing.categoryId !== groupId ||
      existing.name !== desired.name ||
      (existing.description ?? null) !== desired.description ||
      (existing.icon ?? null) !== desired.icon ||
      existing.displayOrder !== desired.displayOrder

    actions.push(needsUpdate ? 'update' : 'noop')
  }

  return { actions, rows }
}

async function inspectToolActions(database: DatabaseClient) {
  const rows = await database.query.tools.findMany({
    where: inArray(
      tools.slug,
      AI_DEVTOOLS_TOOLS.map((tool) => tool.slug),
    ),
  })
  const bySlug = new Map(rows.map((row) => [row.slug, row]))
  const actions: Action[] = []

  for (const desired of AI_DEVTOOLS_TOOLS) {
    const existing = bySlug.get(desired.slug)
    if (!existing) {
      actions.push('create')
      continue
    }

    const needsUpdate =
      existing.name !== desired.name ||
      (existing.description ?? null) !== desired.description ||
      (existing.website ?? null) !== desired.website ||
      (existing.logoUrl ?? null) !== (desired.logoUrl ?? null)

    actions.push(needsUpdate ? 'update' : 'noop')
  }

  return { actions, rows }
}

async function inspectPromptActions(database: DatabaseClient) {
  const targetPromptRows = getTargetPromptRows()
  const existingRows = await database.query.prompts.findMany({
    where: inArray(prompts.slug, [...TARGET_PROMPT_SLUGS]),
    orderBy: [asc(prompts.slug), asc(prompts.level)],
  })

  const byKey = new Map(existingRows.map((row) => [`${row.slug}:${row.level}`, row]))
  const actions: Action[] = []

  for (const desired of targetPromptRows) {
    const existing = byKey.get(`${desired.slug}:${desired.level}`)
    if (!existing) {
      actions.push('create')
      continue
    }

    const matches =
      existing.title === desired.title &&
      existing.level === desired.level &&
      (existing.description ?? null) === desired.description &&
      (existing.contentMd ?? null) === desired.contentMd &&
      existing.isActive === desired.isActive &&
      arraysEqual(existing.expectedCategories, desired.expectedCategories)

    if (!matches) {
      throw new Error(
        `Prompt ${desired.slug}:${desired.level} already exists with different content or category metadata`,
      )
    }

    actions.push('noop')
  }

  return { actions }
}

async function inspectAliasActions(database: DatabaseClient) {
  const desiredAliasRows = AI_DEVTOOLS_TOOLS.flatMap((tool) =>
    (tool.aliases ?? []).map((alias) => ({
      toolSlug: tool.slug,
      alias,
      normalizedAlias: normalizeAlias(alias),
    })),
  )

  const aliasOwnerByNormalized = new Map<string, string>()
  for (const aliasRow of desiredAliasRows) {
    const existingOwner = aliasOwnerByNormalized.get(aliasRow.normalizedAlias)
    if (existingOwner) {
      throw new Error(
        `Duplicate desired alias normalization ${aliasRow.normalizedAlias} for ${existingOwner} and ${aliasRow.toolSlug}`,
      )
    }
    aliasOwnerByNormalized.set(aliasRow.normalizedAlias, aliasRow.toolSlug)
  }

  const existingAliases =
    desiredAliasRows.length === 0
      ? []
      : await database
          .select({
            normalizedAlias: toolAliases.normalizedAlias,
            toolSlug: tools.slug,
          })
          .from(toolAliases)
          .innerJoin(tools, eq(toolAliases.toolId, tools.id))
          .where(
            inArray(
              toolAliases.normalizedAlias,
              desiredAliasRows.map((aliasRow) => aliasRow.normalizedAlias),
            ),
          )

  const existingAliasByNormalized = new Map(
    existingAliases.map((row) => [row.normalizedAlias, row.toolSlug]),
  )

  for (const aliasRow of desiredAliasRows) {
    const existingOwner = existingAliasByNormalized.get(aliasRow.normalizedAlias)
    if (existingOwner && existingOwner !== aliasRow.toolSlug) {
      throw new Error(
        `Alias collision: "${aliasRow.alias}" is already owned by ${existingOwner}, not ${aliasRow.toolSlug}`,
      )
    }
  }

  const createCount = desiredAliasRows.filter(
    (aliasRow) => !existingAliasByNormalized.has(aliasRow.normalizedAlias),
  ).length

  return {
    create: createCount,
    unchanged: desiredAliasRows.length - createCount,
  }
}

async function inspectToolCategoryActions(database: DatabaseClient) {
  const targetCategoryRows = await database.query.subcategories.findMany({
    where: inArray(
      subcategories.slug,
      AI_DEVTOOLS_SUBCATEGORIES.map((subcategory) => subcategory.slug),
    ),
  })
  const targetToolRows = await database.query.tools.findMany({
    where: inArray(
      tools.slug,
      AI_DEVTOOLS_TOOLS.map((tool) => tool.slug),
    ),
  })

  const categoryIdBySlug = new Map(targetCategoryRows.map((row) => [row.slug, row.id]))
  const toolIdBySlug = new Map(targetToolRows.map((row) => [row.slug, row.id]))
  const existingRows =
    targetCategoryRows.length === 0 || targetToolRows.length === 0
      ? []
      : await database.query.toolCategories.findMany({
          where: and(
            inArray(
              toolCategories.categoryId,
              targetCategoryRows.map((row) => row.id),
            ),
            inArray(
              toolCategories.toolId,
              targetToolRows.map((row) => row.id),
            ),
          ),
        })

  const existingByKey = new Map(existingRows.map((row) => [`${row.toolId}:${row.categoryId}`, row]))
  const actions: Action[] = []

  for (const desired of AI_DEVTOOLS_TOOL_CATEGORY_ASSIGNMENTS) {
    const toolId = toolIdBySlug.get(desired.toolSlug)
    const categoryId = categoryIdBySlug.get(desired.categorySlug)
    if (!toolId || !categoryId) {
      actions.push('create')
      continue
    }

    const existing = existingByKey.get(`${toolId}:${categoryId}`)
    if (!existing) {
      actions.push('create')
      continue
    }

    actions.push(existing.isPrimary === desired.isPrimary ? 'noop' : 'update')
  }

  return { actions }
}

async function loadActiveBenchmarkShape(database: DatabaseClient) {
  const activePromptRows = await database.query.prompts.findMany({
    where: eq(prompts.isActive, true),
    columns: { id: true },
  })
  const activeLlmRows = await database.query.llms.findMany({
    where: eq(llms.isActive, true),
    columns: { id: true, modelId: true },
  })

  const eligibleModelCount = activeLlmRows.filter((row) =>
    isMatchEligibleRequestedModelId(row.modelId),
  ).length

  return {
    activePromptCount: activePromptRows.length,
    activeModelCount: activeLlmRows.length,
    matchEligibleModelCount: eligibleModelCount,
  }
}

async function applyCategoryUpserts(database: DatabaseClient, groupId: string) {
  const actions: Action[] = []

  for (const desired of AI_DEVTOOLS_SUBCATEGORIES) {
    const existing = await database.query.subcategories.findFirst({
      where: eq(subcategories.slug, desired.slug),
    })

    if (!existing) {
      await database.insert(subcategories).values({
        categoryId: groupId,
        name: desired.name,
        slug: desired.slug,
        description: desired.description,
        icon: desired.icon,
        displayOrder: desired.displayOrder,
      })
      actions.push('create')
      continue
    }

    const needsUpdate =
      existing.categoryId !== groupId ||
      existing.name !== desired.name ||
      (existing.description ?? null) !== desired.description ||
      (existing.icon ?? null) !== desired.icon ||
      existing.displayOrder !== desired.displayOrder

    if (needsUpdate) {
      await database
        .update(subcategories)
        .set({
          categoryId: groupId,
          name: desired.name,
          description: desired.description,
          icon: desired.icon,
          displayOrder: desired.displayOrder,
        })
        .where(eq(subcategories.id, existing.id))
      actions.push('update')
      continue
    }

    actions.push('noop')
  }

  const rows = await database.query.subcategories.findMany({
    where: inArray(
      subcategories.slug,
      AI_DEVTOOLS_SUBCATEGORIES.map((subcategory) => subcategory.slug),
    ),
  })

  return { actions, rows }
}

async function applyToolUpserts(database: DatabaseClient) {
  const actions: Action[] = []

  for (const desired of AI_DEVTOOLS_TOOLS) {
    const existing = await database.query.tools.findFirst({
      where: eq(tools.slug, desired.slug),
    })

    if (!existing) {
      await database.insert(tools).values({
        name: desired.name,
        slug: desired.slug,
        description: desired.description,
        website: desired.website,
        logoUrl: desired.logoUrl ?? null,
      })
      actions.push('create')
      continue
    }

    const needsUpdate =
      existing.name !== desired.name ||
      (existing.description ?? null) !== desired.description ||
      (existing.website ?? null) !== desired.website ||
      (existing.logoUrl ?? null) !== (desired.logoUrl ?? null)

    if (needsUpdate) {
      await database
        .update(tools)
        .set({
          name: desired.name,
          description: desired.description,
          website: desired.website,
          logoUrl: desired.logoUrl ?? null,
        })
        .where(eq(tools.id, existing.id))
      actions.push('update')
      continue
    }

    actions.push('noop')
  }

  const rows = await database.query.tools.findMany({
    where: inArray(
      tools.slug,
      AI_DEVTOOLS_TOOLS.map((tool) => tool.slug),
    ),
  })

  return { actions, rows }
}

async function applyAliasUpserts(database: DatabaseClient, toolIdBySlug: Map<string, string>) {
  const desiredAliasRows = AI_DEVTOOLS_TOOLS.flatMap((tool) =>
    (tool.aliases ?? []).map((alias) => ({
      toolSlug: tool.slug,
      alias,
      normalizedAlias: normalizeAlias(alias),
    })),
  )

  const desiredOwnerByNormalized = new Map<string, string>()
  for (const desiredAlias of desiredAliasRows) {
    const existingOwner = desiredOwnerByNormalized.get(desiredAlias.normalizedAlias)
    if (existingOwner) {
      throw new Error(
        `Duplicate desired alias normalization ${desiredAlias.normalizedAlias} for ${existingOwner} and ${desiredAlias.toolSlug}`,
      )
    }
    desiredOwnerByNormalized.set(desiredAlias.normalizedAlias, desiredAlias.toolSlug)
  }

  const existingRows =
    desiredAliasRows.length === 0
      ? []
      : await database
          .select({
            normalizedAlias: toolAliases.normalizedAlias,
            toolId: toolAliases.toolId,
          })
          .from(toolAliases)
          .where(
            inArray(
              toolAliases.normalizedAlias,
              desiredAliasRows.map((row) => row.normalizedAlias),
            ),
          )

  const existingByNormalized = new Map(existingRows.map((row) => [row.normalizedAlias, row.toolId]))
  let createCount = 0

  for (const desiredAlias of desiredAliasRows) {
    const targetToolId = toolIdBySlug.get(desiredAlias.toolSlug)
    if (!targetToolId) {
      throw new Error(`Unable to resolve tool ID for alias insert: ${desiredAlias.toolSlug}`)
    }

    const existingToolId = existingByNormalized.get(desiredAlias.normalizedAlias)
    if (existingToolId && existingToolId !== targetToolId) {
      throw new Error(
        `Alias collision while writing "${desiredAlias.alias}" for ${desiredAlias.toolSlug}`,
      )
    }

    if (existingToolId) continue

    await database.insert(toolAliases).values({
      toolId: targetToolId,
      alias: desiredAlias.alias,
      normalizedAlias: desiredAlias.normalizedAlias,
      source: ROLLOUT_TAG,
    })
    createCount += 1
  }

  return {
    create: createCount,
    unchanged: desiredAliasRows.length - createCount,
  }
}

async function applyToolCategoryUpserts(
  database: DatabaseClient,
  toolIdBySlug: Map<string, string>,
  categoryIdBySlug: Map<string, string>,
) {
  const actions: Action[] = []

  for (const desired of AI_DEVTOOLS_TOOL_CATEGORY_ASSIGNMENTS) {
    const toolId = toolIdBySlug.get(desired.toolSlug)
    const categoryId = categoryIdBySlug.get(desired.categorySlug)
    if (!toolId || !categoryId) {
      throw new Error(`Unable to resolve assignment ${desired.toolSlug} -> ${desired.categorySlug}`)
    }

    const existing = await database.query.toolCategories.findFirst({
      where: and(eq(toolCategories.toolId, toolId), eq(toolCategories.categoryId, categoryId)),
    })

    if (!existing) {
      await database.insert(toolCategories).values({
        toolId,
        categoryId,
        isPrimary: desired.isPrimary,
      })
      actions.push('create')
      continue
    }

    if (existing.isPrimary !== desired.isPrimary) {
      await database
        .update(toolCategories)
        .set({ isPrimary: desired.isPrimary })
        .where(eq(toolCategories.id, existing.id))
      actions.push('update')
      continue
    }

    actions.push('noop')
  }

  return { actions }
}

async function applyPromptUpserts(database: DatabaseClient) {
  const actions: Action[] = []

  for (const desired of getTargetPromptRows()) {
    const existing = await database.query.prompts.findFirst({
      where: and(eq(prompts.slug, desired.slug), eq(prompts.level, desired.level)),
    })

    if (!existing) {
      await database.insert(prompts).values(desired)
      actions.push('create')
      continue
    }

    const matches =
      existing.title === desired.title &&
      existing.level === desired.level &&
      (existing.description ?? null) === desired.description &&
      (existing.contentMd ?? null) === desired.contentMd &&
      existing.isActive === desired.isActive &&
      arraysEqual(existing.expectedCategories, desired.expectedCategories)

    if (!matches) {
      throw new Error(
        `Prompt ${desired.slug}:${desired.level} already exists with different content or category metadata`,
      )
    }

    actions.push('noop')
  }

  return { actions }
}

async function ensureTargetSeason(
  database: DatabaseClient,
  protocolId: string,
): Promise<{
  season: typeof benchmarkSeasons.$inferSelect
  action: 'created' | 'reused-draft' | 'reused-active'
}> {
  const existing = await database.query.benchmarkSeasons.findFirst({
    where: eq(benchmarkSeasons.slug, TARGET_SEASON_SLUG),
    orderBy: [desc(benchmarkSeasons.createdAt)],
  })

  if (existing) {
    if (existing.protocolId !== protocolId) {
      throw new Error(`Target season ${TARGET_SEASON_SLUG} uses a different protocol`)
    }
    if (!['draft', 'active'].includes(existing.status)) {
      throw new Error(
        `Target season ${TARGET_SEASON_SLUG} is in unsupported status ${existing.status}`,
      )
    }
    return {
      season: existing,
      action: existing.status === 'draft' ? 'reused-draft' : 'reused-active',
    }
  }

  const [season] = await database
    .insert(benchmarkSeasons)
    .values({
      protocolId,
      slug: TARGET_SEASON_SLUG,
      name: TARGET_SEASON_NAME,
      status: 'draft',
      notes: `Created by scripts/rollout-ai-devtools.ts for ${ROLLOUT_DATE} UTC rollout.`,
    })
    .returning()

  if (!season) {
    throw new Error(`Failed to create target season ${TARGET_SEASON_SLUG}`)
  }

  return { season, action: 'created' }
}

async function freezeSeasonSnapshot(
  database: DatabaseClient,
  seasonId: string,
): Promise<{
  promptVersionCount: number
  modelSnapshotCount: number
  caseCount: number
}> {
  const activePrompts = await database.query.prompts.findMany({
    where: and(eq(prompts.isActive, true)),
  })
  const promptsWithContent = activePrompts.filter(
    (prompt) => (prompt.contentMd ?? '').trim().length > 0,
  )
  if (promptsWithContent.length === 0) {
    throw new Error('No active prompts with content found')
  }

  const activeLlms = await database.query.llms.findMany({
    where: eq(llms.isActive, true),
  })
  if (activeLlms.length === 0) {
    throw new Error('No active LLMs found')
  }

  const allCategorySlugs = [
    ...new Set(promptsWithContent.flatMap((prompt) => prompt.expectedCategories ?? [])),
  ]
  const categoryRows =
    allCategorySlugs.length === 0
      ? []
      : await database
          .select({ id: subcategories.id, slug: subcategories.slug })
          .from(subcategories)
          .where(inArray(subcategories.slug, allCategorySlugs))
  const categoryIdBySlug = new Map(categoryRows.map((row) => [row.slug, row.id]))

  const promptVersions: Array<typeof schema.benchmarkPromptVersions.$inferSelect> = []
  for (const prompt of promptsWithContent) {
    const categoryIds = (prompt.expectedCategories ?? []).map((slug) => {
      const categoryId = categoryIdBySlug.get(slug)
      if (!categoryId) {
        throw new Error(`Prompt ${prompt.slug}:${prompt.level} references unknown category ${slug}`)
      }
      return categoryId
    })

    if (categoryIds.length === 0) continue
    promptVersions.push(await freezePromptVersion(database, prompt.id, { categoryIds }))
  }

  if (promptVersions.length === 0) {
    throw new Error('No prompts with eligible categories could be frozen')
  }

  const modelSnapshots: Array<typeof schema.benchmarkModelSnapshots.$inferSelect> = []
  for (const llm of activeLlms) {
    modelSnapshots.push(
      await getOrCreateModelSnapshot(database, llm.id, {
        temperature: serverSettings.benchmark.modelDefaults.temperature,
        topP: serverSettings.benchmark.modelDefaults.topP,
        maxTokens: serverSettings.benchmark.modelDefaults.maxTokens,
      }),
    )
  }

  return await database.transaction(async (tx) => {
    const txDatabase = tx as unknown as DatabaseClient
    const [guardedSeason] = await txDatabase
      .update(benchmarkSeasons)
      .set({ status: 'active' })
      .where(and(eq(benchmarkSeasons.id, seasonId), eq(benchmarkSeasons.status, 'draft')))
      .returning({ id: benchmarkSeasons.id })

    if (!guardedSeason) {
      throw new Error('Season state changed before freeze could activate it')
    }

    await txDatabase.insert(benchmarkSeasonPrompts).values(
      promptVersions.map((promptVersion) => ({
        seasonId,
        promptVersionId: promptVersion.id,
      })),
    )

    await txDatabase.insert(benchmarkSeasonModels).values(
      modelSnapshots.map((modelSnapshot) => ({
        seasonId,
        modelSnapshotId: modelSnapshot.id,
      })),
    )

    const caseRows = promptVersions.flatMap((promptVersion) =>
      modelSnapshots.map((modelSnapshot) => ({
        seasonId,
        promptVersionId: promptVersion.id,
        modelSnapshotId: modelSnapshot.id,
      })),
    )

    await txDatabase.insert(benchmarkCases).values(caseRows)

    return {
      promptVersionCount: promptVersions.length,
      modelSnapshotCount: modelSnapshots.length,
      caseCount: caseRows.length,
    }
  })
}

async function loadSeasonShape(database: DatabaseClient, seasonId: string) {
  const seasonPromptRows = await database
    .select({ promptVersionId: benchmarkSeasonPrompts.promptVersionId })
    .from(benchmarkSeasonPrompts)
    .where(eq(benchmarkSeasonPrompts.seasonId, seasonId))

  const seasonModelRows = await database
    .select({
      modelSnapshotId: benchmarkSeasonModels.modelSnapshotId,
      requestedModelId: benchmarkModelSnapshots.requestedModelId,
    })
    .from(benchmarkSeasonModels)
    .innerJoin(
      benchmarkModelSnapshots,
      eq(benchmarkSeasonModels.modelSnapshotId, benchmarkModelSnapshots.id),
    )
    .where(eq(benchmarkSeasonModels.seasonId, seasonId))

  const caseRows = await database
    .select({ id: benchmarkCases.id })
    .from(benchmarkCases)
    .where(eq(benchmarkCases.seasonId, seasonId))

  return {
    promptVersionCount: seasonPromptRows.length,
    modelSnapshotCount: seasonModelRows.length,
    caseCount: caseRows.length,
    matchEligibleModelCount: seasonModelRows.filter((row) =>
      isMatchEligibleRequestedModelId(row.requestedModelId),
    ).length,
  }
}

async function completeSourceSeasonIfNeeded(database: DatabaseClient) {
  const sourceSeason = await database.query.benchmarkSeasons.findFirst({
    where: eq(benchmarkSeasons.slug, SOURCE_ACTIVE_SEASON_SLUG),
    orderBy: [desc(benchmarkSeasons.createdAt)],
  })

  if (!sourceSeason || sourceSeason.status !== 'active') {
    return null
  }

  await database
    .update(benchmarkSeasons)
    .set({ status: 'completed' })
    .where(eq(benchmarkSeasons.id, sourceSeason.id))

  return sourceSeason.slug
}

async function loadFrozenCategorySlugs(database: DatabaseClient, seasonId: string) {
  const rows = await database
    .selectDistinct({ slug: subcategories.slug, displayOrder: subcategories.displayOrder })
    .from(benchmarkSeasonPrompts)
    .innerJoin(
      schema.benchmarkPromptVersionCategories,
      eq(
        benchmarkSeasonPrompts.promptVersionId,
        schema.benchmarkPromptVersionCategories.promptVersionId,
      ),
    )
    .innerJoin(
      subcategories,
      eq(schema.benchmarkPromptVersionCategories.categoryId, subcategories.id),
    )
    .where(eq(benchmarkSeasonPrompts.seasonId, seasonId))
    .orderBy(asc(subcategories.displayOrder), asc(subcategories.slug))

  return rows.map((row) => row.slug)
}

async function queuePlannedMatchups(
  database: DatabaseClient,
  seasonId: string,
  matchTemplateId: string,
  adminUserId: string,
  toolIdBySlug: Map<string, string>,
  categoryIdBySlug: Map<string, string>,
) {
  const { createMatchBatch } = await import('~/server/llm/match/batches')
  const statuses: string[] = []
  let totalMatchEvaluations = 0

  for (const matchup of AI_DEVTOOLS_MATCHUPS) {
    const toolAId = toolIdBySlug.get(matchup.toolASlug)
    const toolBId = toolIdBySlug.get(matchup.toolBSlug)
    const categoryId = categoryIdBySlug.get(matchup.categorySlug)
    if (!toolAId || !toolBId || !categoryId) {
      throw new Error(
        `Unable to resolve IDs for matchup ${matchup.categorySlug}:${matchup.toolASlug}:${matchup.toolBSlug}`,
      )
    }

    const idempotencyKey = buildBatchIdempotencyKey(
      matchup.categorySlug,
      matchup.toolASlug,
      matchup.toolBSlug,
    )

    const existingBatch = await database.query.matchBatches.findFirst({
      where: eq(matchBatches.idempotencyKey, idempotencyKey),
      columns: { id: true },
    })

    const batch = await createMatchBatch(database, {
      seasonId,
      categoryId,
      toolAId,
      toolBId,
      promptTemplateId: matchTemplateId,
      triggerMode: 'manual',
      idempotencyKey,
      triggeredBy: adminUserId,
    })

    statuses.push(existingBatch ? `existing:${batch.status}` : `created:${batch.status}`)
    totalMatchEvaluations += batch.totalEvaluations
  }

  return {
    matchBatchCount: AI_DEVTOOLS_MATCHUPS.length,
    totalMatchEvaluations,
    matchBatchStatuses: statuses,
  }
}

async function loadLatestActiveSeason(database: DatabaseClient) {
  return (
    (await database.query.benchmarkSeasons.findFirst({
      where: eq(benchmarkSeasons.status, 'active'),
      orderBy: [desc(benchmarkSeasons.createdAt), desc(benchmarkSeasons.id)],
    })) ?? null
  )
}

async function runDryRun(
  database: DatabaseClient,
  preflight: PreflightState,
): Promise<DryRunSummary> {
  const currentShape = await loadActiveBenchmarkShape(database)
  const categoryInspection = await inspectCategoryActions(database, preflight.devtoolsGroup.id)
  const toolInspection = await inspectToolActions(database)
  const promptInspection = await inspectPromptActions(database)
  const aliasInspection = await inspectAliasActions(database)
  const assignmentInspection = await inspectToolCategoryActions(database)

  const promptActionSummary = summarizeActions(promptInspection.actions)
  const futurePromptCount = currentShape.activePromptCount + promptActionSummary.created
  const plannedMatchups = AI_DEVTOOLS_MATCHUPS.map(
    (matchup) => `${matchup.categorySlug}:${matchup.toolASlug}-vs-${matchup.toolBSlug}`,
  )

  return {
    mode: 'dry-run',
    currentActiveSeasonSlug: preflight.activeBenchmarkSeasons[0]?.slug ?? null,
    targetSeasonSlug: TARGET_SEASON_SLUG,
    targetSeasonExists: preflight.targetSeason !== null,
    categoryActions: summarizeActions(categoryInspection.actions),
    toolActions: summarizeActions(toolInspection.actions),
    promptActions: promptActionSummary,
    toolCategoryActions: summarizeActions(assignmentInspection.actions),
    aliasActions: aliasInspection,
    preExistingToolSlugs: toolInspection.rows.map((row) => row.slug).sort(),
    activePromptCountBefore: currentShape.activePromptCount,
    activePromptCountAfter: futurePromptCount,
    activeModelCount: currentShape.activeModelCount,
    estimatedDailyCaseCount: futurePromptCount * currentShape.activeModelCount,
    matchEligibleModelCount: currentShape.matchEligibleModelCount,
    plannedMatchBatchCount: AI_DEVTOOLS_MATCHUPS.length,
    estimatedMatchEvaluations:
      AI_DEVTOOLS_MATCHUPS.length * currentShape.matchEligibleModelCount * 2,
    plannedMatchups,
  }
}

async function runExecute(
  database: DatabaseClient,
  preflight: PreflightState,
): Promise<ExecuteSummary> {
  const currentActiveSeasonSlugBefore = preflight.activeBenchmarkSeasons[0]?.slug ?? null

  const catalogResult = await database.transaction(async (tx) => {
    const txDatabase = tx as unknown as DatabaseClient
    const categoryResult = await applyCategoryUpserts(txDatabase, preflight.devtoolsGroup.id)
    const toolResult = await applyToolUpserts(txDatabase)
    const categoryIdBySlug = new Map(categoryResult.rows.map((row) => [row.slug, row.id]))
    const toolIdBySlug = new Map(toolResult.rows.map((row) => [row.slug, row.id]))
    const aliasResult = await applyAliasUpserts(txDatabase, toolIdBySlug)
    const assignmentResult = await applyToolCategoryUpserts(
      txDatabase,
      toolIdBySlug,
      categoryIdBySlug,
    )
    const promptResult = await applyPromptUpserts(txDatabase)

    return {
      categoryActions: summarizeActions(categoryResult.actions),
      toolActions: summarizeActions(toolResult.actions),
      promptActions: summarizeActions(promptResult.actions),
      toolCategoryActions: summarizeActions(assignmentResult.actions),
      aliasActions: aliasResult,
      categoryIdBySlug,
      toolIdBySlug,
    }
  })

  const ensuredSeason = await ensureTargetSeason(database, preflight.protocol.id)
  let freezeResult: {
    promptVersionCount: number
    modelSnapshotCount: number
    caseCount: number
  }

  if (ensuredSeason.season.status === 'draft') {
    freezeResult = await freezeSeasonSnapshot(database, ensuredSeason.season.id)
  } else {
    const existingShape = await loadSeasonShape(database, ensuredSeason.season.id)
    freezeResult = {
      promptVersionCount: existingShape.promptVersionCount,
      modelSnapshotCount: existingShape.modelSnapshotCount,
      caseCount: existingShape.caseCount,
    }
  }

  const completedSeasonSlug = await completeSourceSeasonIfNeeded(database)
  const frozenCategorySlugs = await loadFrozenCategorySlugs(database, ensuredSeason.season.id)
  const queuedMatches = await queuePlannedMatchups(
    database,
    ensuredSeason.season.id,
    preflight.matchTemplate.id,
    preflight.adminUser.id,
    catalogResult.toolIdBySlug,
    catalogResult.categoryIdBySlug,
  )

  const latestActiveSeason = await loadLatestActiveSeason(database)
  if (!latestActiveSeason || latestActiveSeason.slug !== TARGET_SEASON_SLUG) {
    throw new Error(
      `Latest active season after rollout is ${latestActiveSeason?.slug ?? 'none'}, expected ${TARGET_SEASON_SLUG}`,
    )
  }

  const activeSeasonCount = await database.query.benchmarkSeasons.findMany({
    where: eq(benchmarkSeasons.status, 'active'),
    columns: { id: true },
  })
  if (activeSeasonCount.length !== 1) {
    throw new Error(
      `Expected exactly one active season after rollout, found ${activeSeasonCount.length}`,
    )
  }

  const requiredFrozenCategories = ['ai', 'llm-coding-agents', 'llm-observability', 'llm-evals']
  for (const requiredCategory of requiredFrozenCategories) {
    if (!frozenCategorySlugs.includes(requiredCategory)) {
      throw new Error(`Target season is missing frozen category ${requiredCategory}`)
    }
  }

  return {
    mode: 'execute',
    currentActiveSeasonSlugBefore,
    activeSeasonSlugAfter: latestActiveSeason.slug,
    completedSeasonSlug,
    targetSeasonId: ensuredSeason.season.id,
    categoryActions: catalogResult.categoryActions,
    toolActions: catalogResult.toolActions,
    promptActions: catalogResult.promptActions,
    toolCategoryActions: catalogResult.toolCategoryActions,
    aliasActions: catalogResult.aliasActions,
    seasonAction: ensuredSeason.action,
    freezeResult,
    frozenCategorySlugs,
    matchBatchCount: queuedMatches.matchBatchCount,
    totalMatchEvaluations: queuedMatches.totalMatchEvaluations,
    matchBatchStatuses: queuedMatches.matchBatchStatuses,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  configureRuntimeEnv(args)

  const { sqlClient, database } = createDatabase(args.databaseUrl)

  try {
    const preflight = await loadPreflightState(database)
    if (!args.execute) {
      const summary = await runDryRun(database, preflight)
      console.log(JSON.stringify(summary, null, 2))
      return
    }

    const summary = await runExecute(database, preflight)
    console.log(JSON.stringify(summary, null, 2))
  } finally {
    await sqlClient.end()
  }
}

const entrypoint = process.argv[1]
const isDirectExecution = entrypoint ? import.meta.url === pathToFileURL(entrypoint).href : false

if (isDirectExecution) {
  void main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
