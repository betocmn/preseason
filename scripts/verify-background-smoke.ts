import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { and, asc, desc, eq, inArray, like, or } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '~/server/db/schema'
import {
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkModelSnapshots,
  benchmarkPromptVersions,
  benchmarkRuns,
  benchmarkSeasonModels,
  benchmarkSeasonPrompts,
  benchmarkSeasons,
  llms,
  matchBatches,
  matchEvaluations,
  matchPromptTemplates,
  prompts,
  subcategories,
  tools,
} from '~/server/db/schema'

const BENCHMARK_PROMPT_SLUGS = ['real-estate-website', 'chat-application'] as const
const BENCHMARK_MODEL_SLUGS = [
  'gemini-2-5-flash',
  'gpt-5-4-mini',
  'claude-haiku-4-5',
  'qwen3-coder-next',
] as const

const MATCH_CATEGORY_SLUG = 'auth'
const MATCH_TOOL_SLUGS = ['supabase', 'clerk'] as const
const EXPECTED_MATCH_TEMPLATE_SLUG = 'balanced-comparison-v1'
const SEASON_SLUG_PREFIX = 'verification-smoke-'

type Args = {
  label: string
}

type BenchmarkPromptFixture = {
  promptId: string
  promptVersionId: string
  promptSlug: string
  promptTitle: string
}

type BenchmarkModelFixture = {
  llmId: string
  llmSlug: string
  modelSnapshotId: string
  requestedModelId: string
}

type Artifact = {
  label: string
  startedAt: string
  completedAt?: string
  commitSha: string | null
  smokeSeason?: {
    id: string
    slug: string
    status: string
  }
  baselineActiveSeason?: {
    id: string
    slug: string
  }
  benchmark?: {
    routeStatus: number
    response: unknown
    run: unknown
    caseResults: unknown[]
  }
  match?: {
    routeStatus: number
    response: unknown
    batch: unknown
    evaluations: unknown[]
  }
  error?: string
}

function parseArgs(argv: string[]): Args {
  const labelArg =
    argv.find((arg) => arg.startsWith('--label=')) ??
    (argv.includes('--label') ? `--label=${argv[argv.indexOf('--label') + 1] ?? ''}` : null)
  return {
    label: labelArg?.slice('--label='.length) || 'manual',
  }
}

function formatTimestamp(date: Date) {
  return date.toISOString().replace(/[:.]/g, '-')
}

function formatSlugTimestamp(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'z')
    .toLowerCase()
}

function getRepoRoot() {
  const currentFile = fileURLToPath(import.meta.url)
  return path.resolve(path.dirname(currentFile), '..')
}

function getCommitSha(repoRoot: string) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim()
  } catch {
    return null
  }
}

async function ensureArtifactDir(repoRoot: string, label: string, startedAt: string) {
  const dir = path.join(repoRoot, '.context', 'background-smoke', `${startedAt}-${label}`)
  await mkdir(dir, { recursive: true })
  return dir
}

async function writeArtifact(dir: string, artifact: Artifact) {
  await writeFile(path.join(dir, 'artifact.json'), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
}

function setEphemeralCronSecret() {
  const existing = process.env.CRON_SECRET?.trim()
  if (existing) return existing

  const secret = `smoke-${crypto.randomUUID()}`
  process.env.CRON_SECRET = secret
  return secret
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not configured')
}

const sqlClient = postgres(databaseUrl)
const database = drizzle(sqlClient, { schema })

async function archiveLingeringSmokeSeasons() {
  await database
    .update(benchmarkSeasons)
    .set({ status: 'archived' })
    .where(
      and(
        eq(benchmarkSeasons.status, 'active'),
        like(benchmarkSeasons.slug, `${SEASON_SLUG_PREFIX}%`),
      ),
    )
}

async function getBaselineActiveSeason() {
  const season = await database.query.benchmarkSeasons.findFirst({
    where: eq(benchmarkSeasons.status, 'active'),
    orderBy: desc(benchmarkSeasons.createdAt),
  })

  if (!season) {
    throw new Error('No active benchmark season found')
  }

  return season
}

function orderBySelection<T extends { slug: string }>(rows: T[], orderedSlugs: readonly string[]) {
  const position = new Map(orderedSlugs.map((slug, index) => [slug, index]))
  return rows.sort((left, right) => {
    const leftIndex = position.get(left.slug) ?? Number.MAX_SAFE_INTEGER
    const rightIndex = position.get(right.slug) ?? Number.MAX_SAFE_INTEGER
    return leftIndex - rightIndex
  })
}

async function resolveBenchmarkPromptFixtures(seasonId: string) {
  const rows = await database
    .select({
      slug: prompts.slug,
      title: prompts.title,
      promptId: prompts.id,
      promptVersionId: benchmarkSeasonPrompts.promptVersionId,
    })
    .from(benchmarkSeasonPrompts)
    .innerJoin(
      benchmarkPromptVersions,
      eq(benchmarkSeasonPrompts.promptVersionId, benchmarkPromptVersions.id),
    )
    .innerJoin(prompts, eq(benchmarkPromptVersions.promptId, prompts.id))
    .where(
      and(
        eq(benchmarkSeasonPrompts.seasonId, seasonId),
        inArray(prompts.slug, [...BENCHMARK_PROMPT_SLUGS]),
      ),
    )

  if (rows.length !== BENCHMARK_PROMPT_SLUGS.length) {
    throw new Error(
      `Expected ${BENCHMARK_PROMPT_SLUGS.length} benchmark prompt fixtures, found ${rows.length}`,
    )
  }

  return orderBySelection(rows, BENCHMARK_PROMPT_SLUGS).map<BenchmarkPromptFixture>((row) => ({
    promptId: row.promptId,
    promptVersionId: row.promptVersionId,
    promptSlug: row.slug,
    promptTitle: row.title,
  }))
}

async function resolveBenchmarkModelFixtures(seasonId: string) {
  const rows = await database
    .select({
      slug: llms.slug,
      llmId: llms.id,
      modelSnapshotId: benchmarkSeasonModels.modelSnapshotId,
      requestedModelId: benchmarkModelSnapshots.requestedModelId,
    })
    .from(benchmarkSeasonModels)
    .innerJoin(
      benchmarkModelSnapshots,
      eq(benchmarkSeasonModels.modelSnapshotId, benchmarkModelSnapshots.id),
    )
    .innerJoin(llms, eq(benchmarkModelSnapshots.llmId, llms.id))
    .where(
      and(
        eq(benchmarkSeasonModels.seasonId, seasonId),
        inArray(llms.slug, [...BENCHMARK_MODEL_SLUGS]),
      ),
    )

  if (rows.length !== BENCHMARK_MODEL_SLUGS.length) {
    throw new Error(
      `Expected ${BENCHMARK_MODEL_SLUGS.length} benchmark model fixtures, found ${rows.length}`,
    )
  }

  return orderBySelection(rows, BENCHMARK_MODEL_SLUGS).map<BenchmarkModelFixture>((row) => ({
    llmId: row.llmId,
    llmSlug: row.slug,
    modelSnapshotId: row.modelSnapshotId,
    requestedModelId: row.requestedModelId,
  }))
}

async function createSmokeSeason(
  baselineSeason: Awaited<ReturnType<typeof getBaselineActiveSeason>>,
  promptsForSeason: BenchmarkPromptFixture[],
  modelsForSeason: BenchmarkModelFixture[],
) {
  const createdAt = new Date()
  const slug = `${SEASON_SLUG_PREFIX}${formatSlugTimestamp(createdAt)}`

  const [smokeSeason] = await database
    .insert(benchmarkSeasons)
    .values({
      protocolId: baselineSeason.protocolId,
      slug,
      name: `Verification Smoke ${createdAt.toISOString()}`,
      status: 'active',
      notes: [
        `Created by scripts/verify-background-smoke.ts on ${createdAt.toISOString()}.`,
        `Source active season: ${baselineSeason.slug} (${baselineSeason.id}).`,
      ].join('\n'),
    })
    .returning()

  if (!smokeSeason) {
    throw new Error('Failed to create smoke benchmark season')
  }

  await database.insert(benchmarkSeasonPrompts).values(
    promptsForSeason.map((fixture) => ({
      seasonId: smokeSeason.id,
      promptVersionId: fixture.promptVersionId,
    })),
  )

  await database.insert(benchmarkSeasonModels).values(
    modelsForSeason.map((fixture) => ({
      seasonId: smokeSeason.id,
      modelSnapshotId: fixture.modelSnapshotId,
    })),
  )

  await database.insert(benchmarkCases).values(
    promptsForSeason.flatMap((promptFixture) =>
      modelsForSeason.map((modelFixture) => ({
        seasonId: smokeSeason.id,
        promptVersionId: promptFixture.promptVersionId,
        modelSnapshotId: modelFixture.modelSnapshotId,
      })),
    ),
  )

  return smokeSeason
}

async function archiveSmokeSeason(smokeSeasonId: string) {
  await database
    .update(benchmarkSeasons)
    .set({ status: 'archived' })
    .where(eq(benchmarkSeasons.id, smokeSeasonId))
}

async function invokeBenchmarkRoute(cronSecret: string) {
  const { GET } = await import('../src/app/api/cron/benchmark-run/route')
  const response = await GET(
    new Request('http://localhost/api/cron/benchmark-run', {
      headers: { authorization: `Bearer ${cronSecret}` },
    }),
  )
  return {
    status: response.status,
    body: (await response.json()) as unknown,
  }
}

async function invokeMatchRoute(cronSecret: string, seasonId: string) {
  const { GET } = await import('../src/app/api/cron/match-run/route')
  const response = await GET(
    new Request(`http://localhost/api/cron/match-run?seasonId=${seasonId}`, {
      headers: {
        authorization: `Bearer ${cronSecret}`,
      },
    }),
  )
  return {
    status: response.status,
    body: (await response.json()) as unknown,
  }
}

async function collectBenchmarkArtifacts(smokeSeasonId: string) {
  const run = await database.query.benchmarkRuns.findFirst({
    where: eq(benchmarkRuns.seasonId, smokeSeasonId),
    orderBy: desc(benchmarkRuns.createdAt),
  })

  const caseResults = await database
    .select({
      caseResultId: benchmarkCaseResults.id,
      promptSlug: prompts.slug,
      modelSlug: llms.slug,
      status: benchmarkCaseResults.status,
      requestedModelId: benchmarkCaseResults.requestedModelId,
      returnedModelId: benchmarkCaseResults.returnedModelId,
      finishReason: benchmarkCaseResults.finishReason,
      errorMessage: benchmarkCaseResults.errorMessage,
      promptTokens: benchmarkCaseResults.promptTokens,
      completionTokens: benchmarkCaseResults.completionTokens,
      totalTokens: benchmarkCaseResults.totalTokens,
      latencyMs: benchmarkCaseResults.latencyMs,
      createdAt: benchmarkCaseResults.createdAt,
    })
    .from(benchmarkCaseResults)
    .innerJoin(benchmarkCases, eq(benchmarkCaseResults.caseId, benchmarkCases.id))
    .innerJoin(
      benchmarkPromptVersions,
      eq(benchmarkCases.promptVersionId, benchmarkPromptVersions.id),
    )
    .innerJoin(prompts, eq(benchmarkPromptVersions.promptId, prompts.id))
    .innerJoin(
      benchmarkModelSnapshots,
      eq(benchmarkCases.modelSnapshotId, benchmarkModelSnapshots.id),
    )
    .innerJoin(llms, eq(benchmarkModelSnapshots.llmId, llms.id))
    .where(eq(benchmarkCaseResults.seasonId, smokeSeasonId))
    .orderBy(asc(prompts.slug), asc(llms.slug))

  return { run, caseResults }
}

async function resolveMatchFixtures() {
  const category = await database.query.subcategories.findFirst({
    where: eq(subcategories.slug, MATCH_CATEGORY_SLUG),
  })
  if (!category) {
    throw new Error(`Match category fixture not found: ${MATCH_CATEGORY_SLUG}`)
  }

  const toolRows = await database.query.tools.findMany({
    where: or(eq(tools.slug, MATCH_TOOL_SLUGS[0]), eq(tools.slug, MATCH_TOOL_SLUGS[1])),
  })
  if (toolRows.length !== MATCH_TOOL_SLUGS.length) {
    throw new Error(
      `Expected ${MATCH_TOOL_SLUGS.length} match tool fixtures, found ${toolRows.length}`,
    )
  }

  const toolBySlug = new Map(toolRows.map((tool) => [tool.slug, tool]))
  const toolA = toolBySlug.get(MATCH_TOOL_SLUGS[0])
  const toolB = toolBySlug.get(MATCH_TOOL_SLUGS[1])
  if (!toolA || !toolB) {
    throw new Error('Failed to resolve ordered match tool fixtures')
  }

  const template = await database.query.matchPromptTemplates.findFirst({
    where: eq(matchPromptTemplates.isActive, true),
    orderBy: desc(matchPromptTemplates.createdAt),
  })
  if (!template) {
    throw new Error('No active match prompt template found')
  }
  if (template.slug !== EXPECTED_MATCH_TEMPLATE_SLUG) {
    throw new Error(
      `Expected active match template ${EXPECTED_MATCH_TEMPLATE_SLUG}, found ${template.slug}`,
    )
  }

  return { category, template, toolA, toolB }
}

async function collectMatchArtifacts(batchId: string) {
  const batch = await database.query.matchBatches.findFirst({
    where: eq(matchBatches.id, batchId),
  })

  const evaluations = await database
    .select({
      evaluationId: matchEvaluations.id,
      modelSlug: llms.slug,
      presentationOrder: matchEvaluations.presentationOrder,
      status: matchEvaluations.status,
      winnerDecision: matchEvaluations.winnerDecision,
      requestedModelId: matchEvaluations.requestedModelId,
      returnedModelId: matchEvaluations.returnedModelId,
      errorMessage: matchEvaluations.errorMessage,
      finishReason: matchEvaluations.finishReason,
      promptTokens: matchEvaluations.promptTokens,
      completionTokens: matchEvaluations.completionTokens,
      totalTokens: matchEvaluations.totalTokens,
      latencyMs: matchEvaluations.latencyMs,
      createdAt: matchEvaluations.createdAt,
    })
    .from(matchEvaluations)
    .innerJoin(
      benchmarkModelSnapshots,
      eq(matchEvaluations.modelSnapshotId, benchmarkModelSnapshots.id),
    )
    .innerJoin(llms, eq(benchmarkModelSnapshots.llmId, llms.id))
    .where(eq(matchEvaluations.batchId, batchId))
    .orderBy(asc(llms.slug), asc(matchEvaluations.presentationOrder))

  return { batch, evaluations }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const repoRoot = getRepoRoot()
  const startedAt = formatTimestamp(new Date())
  const artifactDir = await ensureArtifactDir(repoRoot, args.label, startedAt)
  const artifact: Artifact = {
    label: args.label,
    startedAt,
    commitSha: getCommitSha(repoRoot),
  }

  let smokeSeasonId: string | null = null

  try {
    await archiveLingeringSmokeSeasons()

    const baselineSeason = await getBaselineActiveSeason()
    artifact.baselineActiveSeason = {
      id: baselineSeason.id,
      slug: baselineSeason.slug,
    }

    const promptFixtures = await resolveBenchmarkPromptFixtures(baselineSeason.id)
    const modelFixtures = await resolveBenchmarkModelFixtures(baselineSeason.id)
    const smokeSeason = await createSmokeSeason(baselineSeason, promptFixtures, modelFixtures)
    smokeSeasonId = smokeSeason.id
    artifact.smokeSeason = {
      id: smokeSeason.id,
      slug: smokeSeason.slug,
      status: smokeSeason.status,
    }

    const cronSecret = setEphemeralCronSecret()

    const benchmarkRoute = await invokeBenchmarkRoute(cronSecret)
    const benchmarkArtifacts = await collectBenchmarkArtifacts(smokeSeason.id)
    artifact.benchmark = {
      routeStatus: benchmarkRoute.status,
      response: benchmarkRoute.body,
      run: benchmarkArtifacts.run,
      caseResults: benchmarkArtifacts.caseResults,
    }

    const matchFixtures = await resolveMatchFixtures()
    const { createMatchBatch } = await import('../src/server/llm/match/batches')
    const batch = await createMatchBatch(database, {
      seasonId: smokeSeason.id,
      categoryId: matchFixtures.category.id,
      toolAId: matchFixtures.toolA.id,
      toolBId: matchFixtures.toolB.id,
      promptTemplateId: matchFixtures.template.id,
      triggerMode: 'manual',
      idempotencyKey: `verification-smoke:${smokeSeason.id}:auth:supabase:clerk`,
      triggeredBy: null,
    })

    const matchRoute = await invokeMatchRoute(cronSecret, smokeSeason.id)
    const matchArtifacts = await collectMatchArtifacts(batch.id)
    artifact.match = {
      routeStatus: matchRoute.status,
      response: matchRoute.body,
      batch: matchArtifacts.batch,
      evaluations: matchArtifacts.evaluations,
    }
  } catch (error) {
    artifact.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    if (smokeSeasonId) {
      await archiveSmokeSeason(smokeSeasonId)
      if (artifact.smokeSeason) {
        artifact.smokeSeason.status = 'archived'
      }
    }

    artifact.completedAt = formatTimestamp(new Date())
    await writeArtifact(artifactDir, artifact)
    console.log(JSON.stringify(artifact, null, 2))
    await sqlClient.end({ timeout: 1 })
  }
}

void main()
