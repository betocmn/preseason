import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { benchmarkProtocols, benchmarkRuns, benchmarkSeasons } from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { getNextEligibleBenchmarkRunAt, resolveBenchmarkCronRunTarget } from './benchmark'

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (row === undefined) {
    throw new Error('Expected at least one row')
  }

  return row
}

type TestDb = ReturnType<typeof getTestDb>

async function seedActiveBenchmarkSeason(db: TestDb) {
  const protocol = first(
    await db
      .insert(benchmarkProtocols)
      .values({
        slug: 'benchmark-v2',
        name: 'Benchmark V2',
        mode: 'benchmark',
        parserVersion: '1.0',
        scoringVersion: '1.0',
        promptContractVersion: '1.0',
      })
      .returning(),
  )

  return first(
    await db
      .insert(benchmarkSeasons)
      .values({ protocolId: protocol.id, slug: 'season-1', name: 'Season 1', status: 'active' })
      .returning(),
  )
}

describe('resolveBenchmarkCronRunTarget', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('returns an idle resolution when there is no active benchmark season', async () => {
    const db = getTestDb()

    const target = await resolveBenchmarkCronRunTarget(db)

    expect(target).toEqual({
      kind: 'idle',
      reason: 'no_active_season',
    })
  })

  it("resumes the oldest unfinished run before creating today's run", async () => {
    const db = getTestDb()
    const season = await seedActiveBenchmarkSeason(db)

    await db.insert(benchmarkRuns).values([
      { seasonId: season.id, scheduledFor: '2026-03-24', status: 'completed' },
      { seasonId: season.id, scheduledFor: '2026-03-25', status: 'failed' },
      { seasonId: season.id, scheduledFor: '2026-03-26', status: 'pending' },
    ])

    const target = await resolveBenchmarkCronRunTarget(db, {
      now: new Date('2026-03-26T12:00:00.000Z'),
    })

    expect(target).toMatchObject({
      kind: 'run',
      seasonId: season.id,
      scheduledFor: '2026-03-25',
      source: 'unfinished',
    })
  })

  it('keeps an older healthy running run ahead of starting a new day', async () => {
    const db = getTestDb()
    const season = await seedActiveBenchmarkSeason(db)

    const [olderRunningRun] = await db
      .insert(benchmarkRuns)
      .values([
        {
          seasonId: season.id,
          scheduledFor: '2026-03-25',
          status: 'running',
          startedAt: new Date('2026-03-25T00:00:00.000Z'),
          qcSummaryJson: {
            lastHeartbeatAt: '2026-03-25T00:01:00.000Z',
          },
        },
        {
          seasonId: season.id,
          scheduledFor: '2026-03-26',
          status: 'pending',
        },
      ])
      .returning({ id: benchmarkRuns.id, scheduledFor: benchmarkRuns.scheduledFor })

    if (!olderRunningRun) {
      throw new Error('Expected older running run to exist')
    }

    const target = await resolveBenchmarkCronRunTarget(db, {
      now: new Date('2026-03-26T12:00:00.000Z'),
    })

    expect(target).toMatchObject({
      kind: 'run',
      seasonId: season.id,
      runId: olderRunningRun.id,
      scheduledFor: olderRunningRun.scheduledFor,
      source: 'unfinished',
    })
  })

  it('starts today when no unfinished benchmark runs remain', async () => {
    const db = getTestDb()
    const season = await seedActiveBenchmarkSeason(db)

    await db.insert(benchmarkRuns).values({
      seasonId: season.id,
      scheduledFor: '2026-03-25',
      status: 'completed',
    })

    const target = await resolveBenchmarkCronRunTarget(db, {
      now: new Date('2026-03-26T12:00:00.000Z'),
    })

    expect(target).toMatchObject({
      kind: 'run',
      seasonId: season.id,
      scheduledFor: '2026-03-26',
      source: 'today',
    })
    if (target.kind !== 'run') {
      throw new Error('Expected a runnable benchmark target')
    }
    expect(target.runId).toBeUndefined()
  })

  it('waits for the configured cadence before starting a fresh run', async () => {
    const db = getTestDb()
    const season = await seedActiveBenchmarkSeason(db)

    await db.insert(benchmarkRuns).values({
      seasonId: season.id,
      scheduledFor: '2026-03-25',
      status: 'published',
    })

    const target = await resolveBenchmarkCronRunTarget(db, {
      now: new Date('2026-03-25T12:00:00.000Z'),
    })

    expect(target).toEqual({
      kind: 'idle',
      reason: 'waiting_for_next_run_window',
      seasonId: season.id,
      latestScheduledFor: '2026-03-25',
      nextEligibleAt: getNextEligibleBenchmarkRunAt('2026-03-25').toISOString(),
    })
  })
})
