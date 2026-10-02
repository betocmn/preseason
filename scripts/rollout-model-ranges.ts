import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { and, asc, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { serverSettings } from '~/constants/server-settings'
import * as schema from '~/server/db/schema'
import {
  benchmarkCases,
  type benchmarkModelSnapshots,
  benchmarkProtocols,
  benchmarkRuns,
  benchmarkSeasonModels,
  benchmarkSeasonPrompts,
  benchmarkSeasons,
  llms,
  matchBatches,
} from '~/server/db/schema'
import {
  computeSnapshotKey,
  getOrCreateModelSnapshot,
  resolveModelSnapshotParams,
} from '~/server/llm/benchmark/model-snapshotter'
import { getRangeRolloutManifest } from '~/server/llm/benchmark/rollout-manifest'
import { CURATED_LLM_CATALOG } from '~/server/llm/catalog'

type Database = ReturnType<typeof drizzle<typeof schema>>
type Mode = 'dry-run' | 'prepare' | 'activate'
const settings = serverSettings.benchmark.rangeRollout

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
function sameSet(a: string[], b: string[]) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
}

async function inspect(database: Database) {
  const source = await database.query.benchmarkSeasons.findFirst({
    where: eq(benchmarkSeasons.slug, settings.sourceSeasonSlug),
  })
  if (!source) throw new Error('Source season missing')
  const protocol = await database.query.benchmarkProtocols.findFirst({
    where: eq(benchmarkProtocols.id, source.protocolId),
  })
  if (protocol?.mode !== 'benchmark') throw new Error('Source protocol is not a benchmark')
  const [promptRows, modelRows, runs, cases, batches, target, activeSeasons, catalogRows] =
    await Promise.all([
      database.query.benchmarkSeasonPrompts.findMany({
        where: eq(benchmarkSeasonPrompts.seasonId, source.id),
        orderBy: asc(benchmarkSeasonPrompts.promptVersionId),
        with: { promptVersion: { with: { categories: true } } },
      }),
      database.query.benchmarkSeasonModels.findMany({
        where: eq(benchmarkSeasonModels.seasonId, source.id),
        orderBy: asc(benchmarkSeasonModels.modelSnapshotId),
        with: { modelSnapshot: true },
      }),
      database.query.benchmarkRuns.findMany({
        where: eq(benchmarkRuns.seasonId, source.id),
        orderBy: asc(benchmarkRuns.id),
      }),
      database.query.benchmarkCases.findMany({
        where: eq(benchmarkCases.seasonId, source.id),
        orderBy: asc(benchmarkCases.id),
      }),
      database.query.matchBatches.findMany({
        where: eq(matchBatches.seasonId, source.id),
        orderBy: asc(matchBatches.id),
      }),
      database.query.benchmarkSeasons.findFirst({
        where: eq(benchmarkSeasons.slug, settings.targetSeasonSlug),
      }),
      database
        .select({ id: benchmarkSeasons.id })
        .from(benchmarkSeasons)
        .innerJoin(benchmarkProtocols, eq(benchmarkSeasons.protocolId, benchmarkProtocols.id))
        .where(
          and(eq(benchmarkSeasons.status, 'active'), eq(benchmarkProtocols.mode, 'benchmark')),
        ),
      database.query.llms.findMany(),
    ])
  const active = CURATED_LLM_CATALOG.filter((entry) => !entry.archived)
  if (promptRows.length !== settings.expectedPrompts || active.length !== settings.expectedModels)
    throw new Error('Unexpected prompt or panel count')
  if (
    runs.some((run) => ['pending', 'running', 'failed'].includes(run.status)) ||
    batches.some((batch) => ['pending', 'running'].includes(batch.status))
  )
    throw new Error('Source season has unfinished work')
  const applied = source.status === 'completed' && target?.status === 'active'
  if (activeSeasons.length !== 1 || activeSeasons[0]?.id !== (applied ? target?.id : source.id))
    throw new Error('Active season changed')
  if (!applied && source.status !== 'active') throw new Error('Source season is no longer active')
  if (
    target &&
    (target.protocolId !== source.protocolId || !['draft', 'active'].includes(target.status))
  )
    throw new Error('Incompatible target season')
  if (
    catalogRows.some(
      (row) => row.isActive && !CURATED_LLM_CATALOG.some((entry) => entry.modelId === row.modelId),
    )
  )
    throw new Error('Unexpected active catalog entry')
  // Include frozen content, identity, settings, memberships, and historical run state.
  const sourceFingerprint = fingerprint({
    source,
    protocol,
    promptRows,
    modelRows,
    runs,
    cases,
    batches,
  })
  const models = active.map((entry) => {
    const previous = modelRows.find(
      (row) => row.modelSnapshot.requestedModelId === entry.modelId,
    )?.modelSnapshot
    if (previous && previous.tier !== entry.tier)
      throw new Error('Retained capability tier changed')
    const params = previous
      ? {
          temperature: previous.temperature,
          topP: previous.topP,
          maxTokens: previous.maxTokens,
          seed: previous.seed,
        }
      : resolveModelSnapshotParams(entry.modelId, serverSettings.benchmark.modelDefaults)
    return {
      entry,
      previous,
      params,
      snapshotKey: previous?.snapshotKey ?? computeSnapshotKey(entry.modelId, params),
    }
  })
  return { source, target, promptRows, models, catalogRows, sourceFingerprint, applied }
}

async function verifyTarget(database: Database, state: Awaited<ReturnType<typeof inspect>>) {
  if (!state.target) throw new Error('Target season is not prepared')
  const target = state.target
  const [prompts, models, cases] = await Promise.all([
    database.query.benchmarkSeasonPrompts.findMany({
      where: eq(benchmarkSeasonPrompts.seasonId, target.id),
    }),
    database.query.benchmarkSeasonModels.findMany({
      where: eq(benchmarkSeasonModels.seasonId, target.id),
      with: { modelSnapshot: true },
    }),
    database.query.benchmarkCases.findMany({ where: eq(benchmarkCases.seasonId, target.id) }),
  ])
  if (
    !sameSet(
      prompts.map((p) => p.promptVersionId),
      state.promptRows.map((p) => p.promptVersionId),
    ) ||
    !sameSet(
      models.map((m) => m.modelSnapshot.snapshotKey),
      state.models.map((m) => m.snapshotKey),
    )
  )
    throw new Error('Prepared prompt or snapshot membership changed')
  const expectedCases = prompts.flatMap((p) =>
    models.map((m) => `${p.promptVersionId}:${m.modelSnapshotId}`),
  )
  if (
    !sameSet(
      cases.filter((c) => c.isActive).map((c) => `${c.promptVersionId}:${c.modelSnapshotId}`),
      expectedCases,
    ) ||
    cases.length !== expectedCases.length
  )
    throw new Error('Prepared case matrix changed')
  return { promptCount: prompts.length, modelCount: models.length, caseCount: cases.length }
}

/** Read-only by default. Mutations run under one transaction and exclude historical rows. */
export async function rolloutModelRanges(
  database: Database,
  options: { mode?: Mode; expectedSourceFingerprint?: string } = {},
) {
  const mode = options.mode ?? 'dry-run'
  return database.transaction(async (tx) => {
    const database = tx as unknown as Database
    if (mode === 'dry-run') await tx.execute(sql`set transaction read only`)
    else {
      await tx.execute(sql`set local lock_timeout = '5s'`)
      await tx.execute(
        sql`lock table ${benchmarkSeasons}, ${benchmarkSeasonPrompts}, ${benchmarkSeasonModels}, ${benchmarkCases}, ${benchmarkRuns}, ${matchBatches}, ${llms} in share row exclusive mode`,
      )
    }
    const state = await inspect(database)
    const summary = {
      mode,
      sourceSeason: state.source.slug,
      targetSeason: settings.targetSeasonSlug,
      sourceFingerprint: state.sourceFingerprint,
      promptVersionIds: state.promptRows.map((row) => row.promptVersionId),
      modelIds: state.models.map((model) => model.entry.modelId),
      promptCount: state.promptRows.length,
      modelCount: state.models.length,
      caseCount: state.promptRows.length * state.models.length,
      applied: state.applied,
    }
    if (state.applied) {
      await verifyTarget(database, state)
      if (
        !sameSet(
          state.catalogRows.filter((row) => row.isActive).map((row) => row.modelId),
          summary.modelIds,
        )
      )
        throw new Error('Activated catalog changed')
      return { ...summary, action: 'already-active' }
    }
    if (
      options.expectedSourceFingerprint &&
      options.expectedSourceFingerprint !== state.sourceFingerprint
    )
      throw new Error('Source state changed since preflight')
    if (mode === 'dry-run') {
      if (state.target) await verifyTarget(database, state)
      return { ...summary, action: state.target ? 'prepared' : 'would-prepare' }
    }
    if (!options.expectedSourceFingerprint)
      throw new Error('An expected source fingerprint is required for mutations')
    if (mode === 'prepare') {
      if (state.target) {
        await verifyTarget(database, state)
        if (
          state.target.notes !==
          JSON.stringify({ version: settings.version, sourceFingerprint: state.sourceFingerprint })
        )
          throw new Error('Source state changed since preparation')
        return { ...summary, action: 'already-prepared' }
      }
      const [target] = await database
        .insert(benchmarkSeasons)
        .values({
          protocolId: state.source.protocolId,
          slug: settings.targetSeasonSlug,
          name: settings.targetSeasonName,
          status: 'draft',
          notes: JSON.stringify({
            version: settings.version,
            sourceFingerprint: state.sourceFingerprint,
          }),
        })
        .returning()
      if (!target) throw new Error('Could not prepare target season')
      const snapshots: (typeof benchmarkModelSnapshots.$inferSelect)[] = []
      for (const model of state.models) {
        if (model.previous) {
          snapshots.push(model.previous)
          continue
        }
        let llm = state.catalogRows.find((row) => row.modelId === model.entry.modelId)
        if (!llm) {
          const { range: _range, tier: _tier, archived: _archived, ...values } = model.entry
          ;[llm] = await database
            .insert(llms)
            .values({ ...values, isActive: false })
            .returning()
        }
        if (!llm) throw new Error('Could not prepare catalog entry')
        snapshots.push(await getOrCreateModelSnapshot(database, llm.id, model.params))
      }
      await database.insert(benchmarkSeasonPrompts).values(
        state.promptRows.map((row) => ({
          seasonId: target.id,
          promptVersionId: row.promptVersionId,
        })),
      )
      await database
        .insert(benchmarkSeasonModels)
        .values(
          snapshots.map((snapshot) => ({ seasonId: target.id, modelSnapshotId: snapshot.id })),
        )
      await database.insert(benchmarkCases).values(
        state.promptRows.flatMap((row) =>
          snapshots.map((snapshot) => ({
            seasonId: target.id,
            promptVersionId: row.promptVersionId,
            modelSnapshotId: snapshot.id,
          })),
        ),
      )
      await verifyTarget(database, { ...state, target })
      return { ...summary, action: 'prepared' }
    }
    await verifyTarget(database, state)
    if (
      state.target?.notes !==
      JSON.stringify({ version: settings.version, sourceFingerprint: state.sourceFingerprint })
    )
      throw new Error('Source state changed since preparation')
    const target = state.target
    if (!target) throw new Error('Target missing')
    for (const entry of CURATED_LLM_CATALOG) {
      await database
        .update(llms)
        .set({ isActive: !entry.archived })
        .where(eq(llms.modelId, entry.modelId))
    }
    const [completed] = await database
      .update(benchmarkSeasons)
      .set({ status: 'completed' })
      .where(and(eq(benchmarkSeasons.id, state.source.id), eq(benchmarkSeasons.status, 'active')))
      .returning()
    const [activated] = await database
      .update(benchmarkSeasons)
      .set({ status: 'active' })
      .where(and(eq(benchmarkSeasons.id, target.id), eq(benchmarkSeasons.status, 'draft')))
      .returning()
    if (!completed || !activated) throw new Error('Season state changed during activation')
    return { ...summary, action: 'activated', applied: true }
  })
}

export function productionDatabaseUrlFromEnvFile(contents: string) {
  const value = contents
    .split('PROD SUPABASE')[1]
    ?.match(/^\s*#\s*DATABASE_URL\s*=\s*(.+)\s*$/m)?.[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, '')
  if (!value || !['postgres:', 'postgresql:'].includes(new URL(value).protocol))
    throw new Error('Commented production DATABASE_URL missing')
  return value
}

async function main() {
  const args = process.argv.slice(2)
  const mode: Mode = args.includes('--activate')
    ? 'activate'
    : args.includes('--prepare')
      ? 'prepare'
      : 'dry-run'
  const argument = (name: string) => {
    const index = args.indexOf(name)
    return index < 0 ? undefined : args[index + 1]
  }
  const allowed = [
    '--production',
    '--prepare',
    '--activate',
    '--dry-run',
    '--expected-source',
    '--smoke-report',
  ]
  for (let i = 0; i < args.length; i++) {
    if (!allowed.includes(args[i] ?? '')) throw new Error('Unknown rollout argument')
    if (['--expected-source', '--smoke-report'].includes(args[i] ?? '')) i++
  }
  if (args.filter((arg) => ['--prepare', '--activate', '--dry-run'].includes(arg)).length > 1)
    throw new Error('Choose one rollout mode')
  const databaseUrl = args.includes('--production')
    ? productionDatabaseUrlFromEnvFile(readFileSync('.env.local', 'utf8'))
    : process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL missing')
  const client = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 15 })
  try {
    const database = drizzle(client, { schema })
    if (mode === 'activate') {
      const state = await inspect(database)
      await verifyActivationPreflight(
        state.models
          .filter((model) => !model.previous)
          .map((model) => ({ modelId: model.entry.modelId, params: model.params })),
        argument('--smoke-report'),
      )
    }
    const result = await rolloutModelRanges(database, {
      mode,
      expectedSourceFingerprint: argument('--expected-source'),
    })
    console.log(JSON.stringify(result, null, 2))
    if (mode === 'activate') await deploymentRequest('POST')
  } finally {
    await client.end()
  }
}

async function deploymentRequest(method: 'GET' | 'POST') {
  if (!process.env.CRON_SECRET) throw new Error('CRON_SECRET required for deployment preflight')
  const response = await fetch(`${settings.productionUrl}/api/benchmark-rollout`, {
    method,
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    redirect: 'error',
  })
  if (!response.ok) throw new Error(`Deployment ${method} failed (${response.status})`)
  const manifest = (await response.json()) as { fingerprint: string }
  if (manifest.fingerprint !== getRangeRolloutManifest().fingerprint)
    throw new Error('Production deployment does not match the rollout contract')
}

type SmokeReport = {
  finishedAt: string
  after: { limit: number; remaining: number }
  results: {
    modelId: string
    promptId: string
    level: string
    params: unknown
    parseStatus: string
    drift: boolean
  }[]
}
type SmokeModel = { modelId: string; params: unknown }

export function validateSmokeReport(report: SmokeReport, requiredModels: SmokeModel[]) {
  const finishedAt = Date.parse(report.finishedAt)
  if (
    !Number.isFinite(finishedAt) ||
    finishedAt > Date.now() ||
    Date.now() - finishedAt > settings.smokeMaxAgeMs ||
    report.after.limit !== settings.monthlyBudgetUsd ||
    report.after.remaining < settings.estimatedRunCostUsd
  )
    throw new Error('Smoke evidence expired or insufficient monthly budget')
  for (const model of requiredModels) {
    const matching = report.results.filter((result) => result.modelId === model.modelId)
    if (
      !matching.some((result) => result.level === 'beginner') ||
      !matching.some((result) => result.level === 'advanced') ||
      new Set(matching.map((result) => result.promptId)).size < 2 ||
      matching.some(
        (result) =>
          result.parseStatus !== 'ok' ||
          result.drift ||
          fingerprint(result.params) !== fingerprint(model.params),
      )
    )
      throw new Error(`Smoke preflight failed for ${model.modelId}`)
  }
}

async function verifyActivationPreflight(requiredModels: SmokeModel[], smokePath?: string) {
  await deploymentRequest('GET')
  if (!smokePath) throw new Error('A successful smoke report is required')
  validateSmokeReport(JSON.parse(readFileSync(smokePath, 'utf8')) as SmokeReport, requiredModels)
  if (!process.env.OPENROUTER_API_KEY)
    throw new Error('OPENROUTER_API_KEY required to verify budget')
  const response = await fetch('https://openrouter.ai/api/v1/key', {
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
    redirect: 'error',
  })
  if (!response.ok) throw new Error('Could not verify current monthly budget')
  const { data } = (await response.json()) as {
    data: { limit: number; limit_reset: string; limit_remaining: number }
  }
  if (
    data.limit !== settings.monthlyBudgetUsd ||
    data.limit_reset !== 'monthly' ||
    data.limit_remaining < settings.estimatedRunCostUsd
  )
    throw new Error('Monthly budget changed or insufficient funds remain')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Rollout failed')
    process.exitCode = 1
  })
}
