import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { benchmarkProtocols, benchmarkRuns, benchmarkSeasons } from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'
import { resolveBenchmarkCronRunTarget } from './benchmark'

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
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  it('returns null when there is no active benchmark season', async () => {
    const db = getTestDb()

    const target = await resolveBenchmarkCronRunTarget(db)

    expect(target).toBeNull()
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
      seasonId: season.id,
      scheduledFor: '2026-03-25',
      source: 'unfinished',
    })
  })

  it('resumes stale running work and skips healthy running work', async () => {
    const db = getTestDb()
    const season = await seedActiveBenchmarkSeason(db)

    const [staleRun] = await db
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
          status: 'running',
          startedAt: new Date('2026-03-26T11:59:00.000Z'),
          qcSummaryJson: {
            lastHeartbeatAt: '2026-03-26T11:59:30.000Z',
          },
        },
      ])
      .returning({ id: benchmarkRuns.id, scheduledFor: benchmarkRuns.scheduledFor })

    if (!staleRun) {
      throw new Error('Expected stale run to exist')
    }

    const staleTarget = await resolveBenchmarkCronRunTarget(db, {
      now: new Date('2026-03-26T12:00:00.000Z'),
      runStaleAfterMs: 5 * 60 * 1000,
    })

    expect(staleTarget).toMatchObject({
      seasonId: season.id,
      runId: staleRun.id,
      scheduledFor: staleRun.scheduledFor,
      source: 'unfinished',
    })

    await db
      .update(benchmarkRuns)
      .set({
        status: 'completed',
        startedAt: new Date('2026-03-26T11:59:00.000Z'),
        qcSummaryJson: {
          lastHeartbeatAt: '2026-03-26T11:59:30.000Z',
        },
      })
      .where(eq(benchmarkRuns.id, staleRun.id))

    const healthyTarget = await resolveBenchmarkCronRunTarget(db, {
      now: new Date('2026-03-26T12:00:00.000Z'),
      runStaleAfterMs: 5 * 60 * 1000,
    })

    expect(healthyTarget).toMatchObject({
      seasonId: season.id,
      scheduledFor: '2026-03-26',
      source: 'today',
    })
    expect(healthyTarget?.runId).toBeUndefined()
  })
})
