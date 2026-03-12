/**
 * Benchmark data generation script for local development
 * Run with: pnpm db:seed-benchmark
 *
 * Generates synthetic benchmark seasons, runs, case results, and decisions
 * so the public UI (homepage, rankings, head-to-head) displays realistic data.
 *
 * Prerequisites: Run `pnpm db:seed` first to create categories, tools, LLMs, and prompts.
 *
 * Idempotent: deletes previous benchmark data then re-creates.
 */

import crypto from 'node:crypto'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const conn = postgres(DATABASE_URL)
const db = drizzle(conn, { schema })

// ============================================================================
// HELPERS
// ============================================================================

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function weightedRandomPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!
    if (r <= 0) return items[i] as T
  }
  return items[items.length - 1] as T
}

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// Model tier classification by name keyword
function classifyModelTier(name: string): 'frontier' | 'mid' | 'small' {
  const lower = name.toLowerCase()
  if (lower.includes('opus') || lower.includes('gpt-4o') || lower.includes('gemini')) {
    if (lower.includes('mini')) return 'mid'
    return 'frontier'
  }
  if (lower.includes('sonnet') || lower.includes('mistral') || lower.includes('deepseek')) {
    return 'mid'
  }
  return 'small'
}

// Prompt tier based on number of expected categories
function classifyPromptTier(categoryCount: number): 'basic' | 'intermediate' | 'advanced' {
  if (categoryCount <= 3) return 'basic'
  if (categoryCount <= 6) return 'intermediate'
  return 'advanced'
}

// ============================================================================
// CLEANUP
// ============================================================================

async function cleanBenchmarkData() {
  console.log('Cleaning previous benchmark data...')
  await db.delete(schema.benchmarkCaseDecisions)
  await db.delete(schema.benchmarkCaseResults)
  await db.delete(schema.benchmarkRuns)
  await db.delete(schema.benchmarkCases)
  await db.delete(schema.benchmarkSeasonModels)
  await db.delete(schema.benchmarkSeasonPrompts)
  await db.delete(schema.benchmarkPromptVersionCategories)
  await db.delete(schema.benchmarkPromptVersions)
  await db.delete(schema.benchmarkModelSnapshots)
  await db.delete(schema.benchmarkSeasons)
  await db.delete(schema.benchmarkProtocols)
  await db.delete(schema.benchmarkModelWeightConfigs)
  console.log('  Cleaned 12 benchmark tables')
}

// ============================================================================
// LOAD EXISTING DATA
// ============================================================================

async function loadExistingData() {
  console.log('Loading existing seed data...')
  const allPrompts = await db.select().from(schema.prompts)
  const allSubcategories = await db.select().from(schema.subcategories)
  const allTools = await db.select().from(schema.tools)
  const allToolCategories = await db.select().from(schema.toolCategories)
  const allLlms = await db.select().from(schema.llms)

  if (
    allPrompts.length === 0 ||
    allSubcategories.length === 0 ||
    allTools.length === 0 ||
    allLlms.length === 0
  ) {
    console.error('Missing seed data. Run `pnpm db:seed` first.')
    process.exit(1)
  }

  // Build category slug → id map
  const categorySlugToId = new Map(allSubcategories.map((c) => [c.slug, c.id]))

  // Build category id → tools map
  const categoryToolsMap = new Map<string, typeof allTools>()
  for (const tc of allToolCategories) {
    const tool = allTools.find((t) => t.id === tc.toolId)
    if (!tool) continue
    const existing = categoryToolsMap.get(tc.categoryId) ?? []
    existing.push(tool)
    categoryToolsMap.set(tc.categoryId, existing)
  }

  console.log(
    `  ${allPrompts.length} prompts, ${allSubcategories.length} subcategories, ${allTools.length} tools, ${allLlms.length} LLMs`,
  )

  return { allPrompts, allSubcategories, allTools, allLlms, categorySlugToId, categoryToolsMap }
}

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function seedBenchmarkData() {
  console.log('=== Benchmark Data Generation ===\n')

  await cleanBenchmarkData()
  const data = await loadExistingData()
  const { allPrompts, allLlms, categorySlugToId, categoryToolsMap } = data

  // 1. Protocol
  console.log('Creating benchmark protocol...')
  const [protocol] = await db
    .insert(schema.benchmarkProtocols)
    .values({
      slug: 'benchmark-v1',
      name: 'Benchmark Protocol v1',
      description: 'Standard benchmark protocol for tool recommendation evaluation',
      mode: 'benchmark',
      parserVersion: '1.0',
      scoringVersion: '1.0',
      promptContractVersion: '1.0',
    })
    .returning()
  console.log('  Protocol ready')

  // 2. Weight config
  console.log('Creating weight config...')
  const [weightConfig] = await db
    .insert(schema.benchmarkModelWeightConfigs)
    .values({
      slug: 'uniform-v1',
      name: 'Uniform Weights',
      description: 'Equal weight for all model tiers',
      frontierWeight: 1.0,
      midWeight: 1.0,
      smallWeight: 1.0,
      isActive: true,
    })
    .returning()
  console.log('  Weight config ready')

  // 3. Season
  console.log('Creating season...')
  const [season] = await db
    .insert(schema.benchmarkSeasons)
    .values({
      protocolId: protocol!.id,
      slug: 'season-1',
      name: 'Season 1',
      status: 'active',
      publishedAt: daysAgo(30),
    })
    .returning()
  console.log('  Season ready')

  // 4. Prompt versions
  console.log('Creating prompt versions...')
  const promptVersions: Array<{
    id: string
    promptId: string
    slug: string
    categoryIds: string[]
  }> = []

  for (const prompt of allPrompts) {
    const expectedCats = (prompt.expectedCategories ?? []) as string[]
    const categoryIds = expectedCats
      .map((slug) => categorySlugToId.get(slug))
      .filter((id): id is string => id !== undefined)

    const tier = classifyPromptTier(categoryIds.length)
    const contentHash = crypto.createHash('sha256').update(`${prompt.slug}-v1`).digest('hex')

    const [pv] = await db
      .insert(schema.benchmarkPromptVersions)
      .values({
        promptId: prompt.id,
        slug: prompt.slug,
        level: prompt.level,
        version: 1,
        tier,
        contentMd: prompt.contentMd ?? prompt.description ?? `Prompt: ${prompt.title}`,
        contentHash,
        promptContractVersion: '1.0',
        isActive: true,
      })
      .returning()

    promptVersions.push({
      id: pv!.id,
      promptId: prompt.id,
      slug: prompt.slug,
      categoryIds,
    })
  }
  console.log(`  ${promptVersions.length} prompt versions ready`)

  // 5. Prompt version categories
  console.log('Creating prompt version categories...')
  const pvcRows: Array<{
    promptVersionId: string
    categoryId: string
    displayOrder: number
  }> = []

  for (const pv of promptVersions) {
    for (let i = 0; i < pv.categoryIds.length; i++) {
      pvcRows.push({
        promptVersionId: pv.id,
        categoryId: pv.categoryIds[i]!,
        displayOrder: i,
      })
    }
  }

  for (const batch of chunk(pvcRows, 500)) {
    await db.insert(schema.benchmarkPromptVersionCategories).values(batch)
  }
  console.log(`  ${pvcRows.length} prompt-category links ready`)

  // 6. Model snapshots
  console.log('Creating model snapshots...')
  const modelSnapshots: Array<{ id: string; llmId: string; tier: 'frontier' | 'mid' | 'small' }> =
    []

  for (const llm of allLlms) {
    const tier = classifyModelTier(llm.name)
    const snapshotKey = `${llm.slug}-t0.7-seed-v1`

    const [ms] = await db
      .insert(schema.benchmarkModelSnapshots)
      .values({
        llmId: llm.id,
        name: llm.name,
        provider: llm.provider,
        tier,
        requestedModelId: llm.modelId,
        snapshotKey,
        temperature: 0.7,
        maxTokens: 4096,
        isDeterministic: false,
      })
      .returning()

    modelSnapshots.push({ id: ms!.id, llmId: llm.id, tier })
  }
  console.log(`  ${modelSnapshots.length} model snapshots ready`)

  // 7. Season junctions
  console.log('Creating season junctions...')
  await db
    .insert(schema.benchmarkSeasonPrompts)
    .values(promptVersions.map((pv) => ({ seasonId: season!.id, promptVersionId: pv.id })))
  await db
    .insert(schema.benchmarkSeasonModels)
    .values(modelSnapshots.map((ms) => ({ seasonId: season!.id, modelSnapshotId: ms.id })))
  console.log(
    `  ${promptVersions.length} season-prompt, ${modelSnapshots.length} season-model junctions ready`,
  )

  // 8. Cases (cartesian product)
  console.log('Creating cases...')
  const caseRows: Array<{
    seasonId: string
    promptVersionId: string
    modelSnapshotId: string
    isActive: boolean
  }> = []

  for (const pv of promptVersions) {
    for (const ms of modelSnapshots) {
      caseRows.push({
        seasonId: season!.id,
        promptVersionId: pv.id,
        modelSnapshotId: ms.id,
        isActive: true,
      })
    }
  }

  const insertedCases: Array<{
    id: string
    promptVersionId: string
    modelSnapshotId: string
  }> = []

  for (const batch of chunk(caseRows, 500)) {
    const results = await db.insert(schema.benchmarkCases).values(batch).returning({
      id: schema.benchmarkCases.id,
      promptVersionId: schema.benchmarkCases.promptVersionId,
      modelSnapshotId: schema.benchmarkCases.modelSnapshotId,
    })
    insertedCases.push(...results)
  }
  console.log(
    `  ${insertedCases.length} cases ready (${promptVersions.length} prompts x ${modelSnapshots.length} models)`,
  )

  // Build case lookup: promptVersionId → categoryIds
  const pvCategoryMap = new Map(promptVersions.map((pv) => [pv.id, pv.categoryIds]))

  // 9. Runs (28 days)
  console.log('Creating runs...')
  const runRows: Array<{
    seasonId: string
    scheduledFor: string
    trigger: string
    status: 'published'
    weightConfigId: string
    startedAt: Date
    completedAt: Date
    expectedCaseCount: number
    completedCaseCount: number
    failedCaseCount: number
    qcStatus: string
  }> = []

  for (let dayOffset = 27; dayOffset >= 0; dayOffset--) {
    const date = daysAgo(dayOffset)
    const startedAt = new Date(date)
    startedAt.setUTCHours(2, 0, 0, 0)
    const completedAt = new Date(date)
    completedAt.setUTCHours(2, 30, 0, 0)

    runRows.push({
      seasonId: season!.id,
      scheduledFor: formatDate(date),
      trigger: 'cron',
      status: 'published',
      weightConfigId: weightConfig!.id,
      startedAt,
      completedAt,
      expectedCaseCount: insertedCases.length,
      completedCaseCount: insertedCases.length,
      failedCaseCount: 0,
      qcStatus: 'passed',
    })
  }

  const insertedRuns = await db.insert(schema.benchmarkRuns).values(runRows).returning({
    id: schema.benchmarkRuns.id,
    scheduledFor: schema.benchmarkRuns.scheduledFor,
  })
  console.log(`  ${insertedRuns.length} published runs ready (past 28 days)`)

  // 10. Case results
  console.log('Creating case results...')
  let totalResults = 0

  const resultBatch: Array<{
    seasonId: string
    runId: string
    caseId: string
    status: 'completed'
    promptTokens: number
    completionTokens: number
    totalTokens: number
    latencyMs: number
    parserVersion: string
  }> = []

  for (const run of insertedRuns) {
    for (const caseRow of insertedCases) {
      const promptTokens = randomInt(800, 1500)
      const completionTokens = randomInt(300, 800)
      resultBatch.push({
        seasonId: season!.id,
        runId: run.id,
        caseId: caseRow.id,
        status: 'completed',
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        latencyMs: randomInt(500, 3000),
        parserVersion: '1.0',
      })
    }
  }

  // Map to track inserted result IDs with their case info
  const insertedResults: Array<{
    id: string
    caseId: string
  }> = []

  for (const batch of chunk(resultBatch, 500)) {
    const results = await db.insert(schema.benchmarkCaseResults).values(batch).returning({
      id: schema.benchmarkCaseResults.id,
      caseId: schema.benchmarkCaseResults.caseId,
    })
    insertedResults.push(...results)
    totalResults += results.length
  }
  console.log(`  ${totalResults} case results ready`)

  // Build case → promptVersionId lookup
  const caseToPromptVersion = new Map(insertedCases.map((c) => [c.id, c.promptVersionId]))

  // 11. Case decisions
  console.log('Creating case decisions...')
  let totalDecisions = 0

  const decisionBatch: Array<{
    caseResultId: string
    categoryId: string
    decisionType: 'tool' | 'none'
    toolId: string | null
    rawToolName: string | null
    resolutionStatus: string
    selfReportedConfidence: number
  }> = []

  for (const result of insertedResults) {
    const promptVersionId = caseToPromptVersion.get(result.caseId)
    if (!promptVersionId) continue

    const categoryIds = pvCategoryMap.get(promptVersionId) ?? []

    for (const categoryId of categoryIds) {
      const tools = categoryToolsMap.get(categoryId) ?? []
      const isTool = Math.random() < 0.85 && tools.length > 0

      if (isTool) {
        // Weighted selection: first tools are favored
        const weights = tools.map((_, i) => {
          if (i === 0) return 5
          if (i === 1) return 3
          if (i === 2) return 2
          return 1
        })
        const selectedTool = weightedRandomPick(tools, weights)

        decisionBatch.push({
          caseResultId: result.id,
          categoryId,
          decisionType: 'tool',
          toolId: selectedTool.id,
          rawToolName: selectedTool.name,
          resolutionStatus: 'resolved',
          selfReportedConfidence: Math.round((0.6 + Math.random() * 0.39) * 100) / 100,
        })
      } else {
        decisionBatch.push({
          caseResultId: result.id,
          categoryId,
          decisionType: 'none',
          toolId: null,
          rawToolName: null,
          resolutionStatus: 'resolved',
          selfReportedConfidence: Math.round((0.6 + Math.random() * 0.39) * 100) / 100,
        })
      }
    }
  }

  for (const batch of chunk(decisionBatch, 1000)) {
    await db.insert(schema.benchmarkCaseDecisions).values(batch)
    totalDecisions += batch.length
  }
  console.log(`  ${totalDecisions} case decisions ready`)

  console.log('\nBenchmark data generation complete!')
}

seedBenchmarkData()
  .catch((e) => {
    console.error('Benchmark data generation failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await conn.end()
  })
