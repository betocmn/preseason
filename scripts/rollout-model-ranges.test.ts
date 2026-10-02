import { and, eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { serverSettings } from '~/constants/server-settings'
import * as schema from '~/server/db/schema'
import { getOrCreateModelSnapshot } from '~/server/llm/benchmark/model-snapshotter'
import { CURATED_LLM_CATALOG } from '~/server/llm/catalog'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import {
  productionDatabaseUrlFromEnvFile,
  rolloutModelRanges,
  validateSmokeReport,
} from './rollout-model-ranges'

function first<T>(rows: T[]) {
  const row = rows[0]
  if (!row) throw new Error('Missing fixture')
  return row
}
const settings = serverSettings.benchmark.rangeRollout
async function seedSource() {
  const db = getTestDb()
  const protocol = first(
    await db
      .insert(schema.benchmarkProtocols)
      .values({
        slug: 'benchmark-v1',
        name: 'Frozen protocol',
        mode: 'benchmark',
        parserVersion: '1.0',
        scoringVersion: '1.0',
        promptContractVersion: '1.0',
      })
      .returning(),
  )
  const season = first(
    await db
      .insert(schema.benchmarkSeasons)
      .values({
        slug: settings.sourceSeasonSlug,
        name: 'Source',
        protocolId: protocol.id,
        status: 'active',
      })
      .returning(),
  )
  const promptRows = await db
    .insert(schema.prompts)
    .values(
      Array.from({ length: 60 }, (_, i) => ({
        slug: `prompt-${i}`,
        title: `Prompt ${i}`,
        level: 'beginner' as const,
        contentMd: 'New mutable text',
      })),
    )
    .returning()
  const versions = await db
    .insert(schema.benchmarkPromptVersions)
    .values(
      promptRows.map((prompt) => ({
        promptId: prompt.id,
        slug: prompt.slug,
        level: prompt.level,
        version: 1,
        contentMd: 'Exact frozen text',
        contentHash: prompt.id,
        promptContractVersion: '1.0',
        systemPromptSnapshot: 'Frozen system',
      })),
    )
    .returning()
  const snapshots: (typeof schema.benchmarkModelSnapshots.$inferSelect)[] = []
  for (const entry of CURATED_LLM_CATALOG.filter((entry) => !entry.archived)) {
    const previous =
      CURATED_LLM_CATALOG.filter(
        (candidate) => candidate.range.id === entry.range.id && candidate.archived,
      ).sort((a, b) => b.range.order - a.range.order)[0] ?? entry
    const { range: _range, tier: _tier, archived: _archived, ...values } = previous
    const llm = first(
      await db
        .insert(schema.llms)
        .values({ ...values, isActive: true })
        .returning(),
    )
    snapshots.push(
      await getOrCreateModelSnapshot(db, llm.id, serverSettings.benchmark.modelDefaults),
    )
  }
  await db
    .insert(schema.benchmarkSeasonPrompts)
    .values(versions.map((version) => ({ seasonId: season.id, promptVersionId: version.id })))
  await db
    .insert(schema.benchmarkSeasonModels)
    .values(snapshots.map((snapshot) => ({ seasonId: season.id, modelSnapshotId: snapshot.id })))
  const cases = await db
    .insert(schema.benchmarkCases)
    .values(
      versions.flatMap((version) =>
        snapshots.map((snapshot) => ({
          seasonId: season.id,
          promptVersionId: version.id,
          modelSnapshotId: snapshot.id,
        })),
      ),
    )
    .returning()
  const runs = await db
    .insert(schema.benchmarkRuns)
    .values([
      { seasonId: season.id, scheduledFor: '2026-08-05', status: 'published' },
      { seasonId: season.id, scheduledFor: '2026-09-05', status: 'completed', qcStatus: 'failed' },
    ])
    .returning()
  await db.insert(schema.benchmarkCaseResults).values({
    seasonId: season.id,
    runId: first(runs).id,
    caseId: first(cases).id,
    status: 'completed',
    provider: 'test',
    requestedModelId: 'historical',
    returnedModelId: 'historical',
    rawResponse: 'Preserved historical answer',
    parserVersion: '1.0',
  })
  return { db, season, versions, snapshots }
}
async function historicalState() {
  const db = getTestDb()
  return {
    runs: await db.query.benchmarkRuns.findMany(),
    results: await db.query.benchmarkCaseResults.findMany(),
    versions: await db.query.benchmarkPromptVersions.findMany(),
  }
}
async function counts() {
  return getTestDb().execute(
    sql`select (select count(*) from ${schema.benchmarkSeasons})::int as seasons,(select count(*) from ${schema.llms})::int as catalog,(select count(*) from ${schema.benchmarkModelSnapshots})::int as snapshots,(select count(*) from ${schema.benchmarkCases})::int as cases`,
  )
}

describe('guarded range rollout', () => {
  beforeAll(setupTestDatabase)
  afterAll(teardownTestDatabase)
  beforeEach(cleanTestDatabase)
  it('dry runs without writes, prepares the exact frozen matrix, and activates idempotently', async () => {
    const { db, season, versions, snapshots } = await seedSource()
    const original = await historicalState()
    const before = await counts()
    const dry = await rolloutModelRanges(db)
    expect(dry).toMatchObject({
      mode: 'dry-run',
      action: 'would-prepare',
      promptCount: 60,
      modelCount: 20,
      caseCount: 1200,
    })
    expect(await counts()).toEqual(before)
    const options = { expectedSourceFingerprint: dry.sourceFingerprint }
    expect((await rolloutModelRanges(db, { ...options, mode: 'prepare' })).action).toBe('prepared')
    expect((await rolloutModelRanges(db, { ...options, mode: 'prepare' })).action).toBe(
      'already-prepared',
    )
    const target = await db.query.benchmarkSeasons.findFirst({
      where: eq(schema.benchmarkSeasons.slug, settings.targetSeasonSlug),
      with: { seasonPrompts: true, seasonModels: { with: { modelSnapshot: true } } },
    })
    expect(target?.status).toBe('draft')
    expect(target?.seasonPrompts.map((row) => row.promptVersionId).sort()).toEqual(
      versions.map((row) => row.id).sort(),
    )
    const retained =
      target?.seasonModels.filter((row) =>
        snapshots.some((snapshot) => snapshot.id === row.modelSnapshotId),
      ) ?? []
    // The fixture uses the latest archived entry for every changing line.
    expect(retained.length).toBeGreaterThan(0)
    expect(
      target?.seasonModels.find(
        (row) => row.modelSnapshot.requestedModelId === 'openai/gpt-6-astra',
      )?.modelSnapshot,
    ).toMatchObject({ temperature: null, topP: null, maxTokens: 4096, tier: 'frontier' })
    expect(
      (
        await db.query.benchmarkSeasons.findFirst({
          where: eq(schema.benchmarkSeasons.id, season.id),
        })
      )?.status,
    ).toBe('active')
    expect((await rolloutModelRanges(db, { ...options, mode: 'activate' })).action).toBe(
      'activated',
    )
    const activatedCounts = await counts()
    expect((await rolloutModelRanges(db, { mode: 'activate', ...options })).action).toBe(
      'already-active',
    )
    expect(await counts()).toEqual(activatedCounts)
    expect(await historicalState()).toEqual(original)
    expect(await db.query.llms.findMany({ where: eq(schema.llms.isActive, true) })).toHaveLength(20)
    expect(
      (
        await db.query.benchmarkSeasons.findFirst({
          where: eq(schema.benchmarkSeasons.id, season.id),
        })
      )?.status,
    ).toBe('completed')
    expect(await db.query.benchmarkRuns.findMany()).toHaveLength(2)
  })
  it('aborts when the source gains unfinished work or changes after preparation', async () => {
    const { db, season } = await seedSource()
    const dry = await rolloutModelRanges(db)
    await rolloutModelRanges(db, {
      mode: 'prepare',
      expectedSourceFingerprint: dry.sourceFingerprint,
    })
    await db
      .update(schema.benchmarkSeasons)
      .set({ notes: 'Source changed' })
      .where(eq(schema.benchmarkSeasons.id, season.id))
    await expect(
      rolloutModelRanges(db, {
        mode: 'activate',
        expectedSourceFingerprint: dry.sourceFingerprint,
      }),
    ).rejects.toThrow('Source state changed')
    await db
      .insert(schema.benchmarkRuns)
      .values({ seasonId: season.id, scheduledFor: '2026-10-05', status: 'running' })
    await expect(rolloutModelRanges(db)).rejects.toThrow('unfinished work')
  })
  it('rolls back catalog and season status changes if activation fails', async () => {
    const { db } = await seedSource()
    const dry = await rolloutModelRanges(db)
    const options = { expectedSourceFingerprint: dry.sourceFingerprint }
    await rolloutModelRanges(db, { ...options, mode: 'prepare' })
    const catalog = await db.query.llms.findMany()
    const seasons = await db.query.benchmarkSeasons.findMany()
    await db.execute(
      sql`create function reject_test_activation() returns trigger as $$ begin if new.slug = 'season-dev-4' and new.status = 'active' then raise exception 'test activation failure'; end if; return new; end; $$ language plpgsql`,
    )
    await db.execute(
      sql`create trigger reject_test_activation before update on ${schema.benchmarkSeasons} for each row execute function reject_test_activation()`,
    )
    try {
      await expect(rolloutModelRanges(db, { ...options, mode: 'activate' })).rejects.toThrow()
      expect(await db.query.llms.findMany()).toEqual(catalog)
      expect(await db.query.benchmarkSeasons.findMany()).toEqual(seasons)
    } finally {
      await db.execute(sql`drop trigger reject_test_activation on ${schema.benchmarkSeasons}`)
      await db.execute(sql`drop function reject_test_activation()`)
    }
  })
  it('rejects changed inference settings even when a stored snapshot key was left untouched', async () => {
    const { db } = await seedSource()
    const dry = await rolloutModelRanges(db)
    await rolloutModelRanges(db, {
      mode: 'prepare',
      expectedSourceFingerprint: dry.sourceFingerprint,
    })
    const snapshot = await db.query.benchmarkModelSnapshots.findFirst({
      where: eq(schema.benchmarkModelSnapshots.requestedModelId, 'openai/gpt-6-astra'),
    })
    if (!snapshot) throw new Error('Missing prepared snapshot')
    await db
      .update(schema.benchmarkModelSnapshots)
      .set({ maxTokens: 8192 })
      .where(eq(schema.benchmarkModelSnapshots.id, snapshot.id))
    await expect(
      rolloutModelRanges(db, {
        mode: 'activate',
        expectedSourceFingerprint: dry.sourceFingerprint,
      }),
    ).rejects.toThrow('inference settings changed')
  })

  it('refuses a changed prepared matrix and leaves the source active', async () => {
    const { db, season } = await seedSource()
    const dry = await rolloutModelRanges(db)
    await rolloutModelRanges(db, {
      mode: 'prepare',
      expectedSourceFingerprint: dry.sourceFingerprint,
    })
    const target = first(
      await db
        .select()
        .from(schema.benchmarkSeasons)
        .where(eq(schema.benchmarkSeasons.slug, settings.targetSeasonSlug)),
    )
    const item = first(
      await db
        .select()
        .from(schema.benchmarkCases)
        .where(eq(schema.benchmarkCases.seasonId, target.id))
        .limit(1),
    )
    await db
      .update(schema.benchmarkCases)
      .set({ isActive: false })
      .where(
        and(eq(schema.benchmarkCases.id, item.id), eq(schema.benchmarkCases.seasonId, target.id)),
      )
    await expect(
      rolloutModelRanges(db, {
        mode: 'activate',
        expectedSourceFingerprint: dry.sourceFingerprint,
      }),
    ).rejects.toThrow('matrix changed')
    expect(
      (
        await db.query.benchmarkSeasons.findFirst({
          where: eq(schema.benchmarkSeasons.id, season.id),
        })
      )?.status,
    ).toBe('active')
  })
})

describe('rollout evidence', () => {
  it('reads only the explicitly commented production URL', () => {
    expect(
      productionDatabaseUrlFromEnvFile(
        'DATABASE_URL=postgres://local/db\n# # # PROD SUPABASE\n#DATABASE_URL="postgres://prod/db"\n',
      ),
    ).toBe('postgres://prod/db')
    expect(() => productionDatabaseUrlFromEnvFile('DATABASE_URL=postgres://local/db')).toThrow(
      'missing',
    )
  })
  it('requires successful representative calls for every changed line', () => {
    const params = { temperature: null, topP: null, maxTokens: 4096 }
    const required = [{ modelId: 'new', params }]
    const report = {
      finishedAt: new Date().toISOString(),
      after: { limit: 20, remaining: 19 },
      results: [
        {
          modelId: 'new',
          params,
          promptId: 'a',
          level: 'beginner',
          parseStatus: 'ok',
          drift: false,
        },
        {
          modelId: 'new',
          params,
          promptId: 'b',
          level: 'advanced',
          parseStatus: 'ok',
          drift: false,
        },
      ],
    }
    expect(() => validateSmokeReport(report, required)).not.toThrow()
    expect(() => validateSmokeReport({ ...report, results: [] }, required)).toThrow('failed')
    expect(() =>
      validateSmokeReport(
        { ...report, results: report.results.map((row) => ({ ...row, drift: true })) },
        required,
      ),
    ).toThrow('failed')
    expect(() =>
      validateSmokeReport(
        {
          ...report,
          results: report.results.map((row) => ({ ...row, parseStatus: 'invalid_output' })),
        },
        required,
      ),
    ).toThrow('failed')
    expect(() =>
      validateSmokeReport({ ...report, after: { limit: 20, remaining: 1 } }, required),
    ).toThrow('budget')
  })
})
