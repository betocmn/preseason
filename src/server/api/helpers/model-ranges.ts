import { TRPCError } from '@trpc/server'
import { and, eq, inArray, lte, ne, sql } from 'drizzle-orm'
import type { ModelFilterCompany } from '~/lib/model-filters'
import type { db } from '~/server/db'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkModelSnapshots,
  benchmarkProtocols,
  benchmarkRuns,
  benchmarkSeasons,
} from '~/server/db/schema'
import { cachedPublicScoring } from '~/server/llm/benchmark/public-cache'
import type { HeadToHeadResult } from '~/server/llm/benchmark/scoring'
import { CURATED_LLM_CATALOG } from '~/server/llm/catalog'
import { getModelRange, summarizeModelRanges } from '~/server/llm/model-ranges'

/** Resolve membership from immutable recorded IDs, independent of activation and season joins. */
export async function resolveModelRangeSelection(
  database: typeof db,
  input?: { modelRangeId?: string; modelSnapshotId?: string },
) {
  if (!input?.modelRangeId && !input?.modelSnapshotId) return {}
  const snapshots = await database.query.benchmarkModelSnapshots.findMany()
  const legacy = input.modelSnapshotId
    ? snapshots.find((snapshot) => snapshot.id === input.modelSnapshotId)
    : undefined
  if (input.modelSnapshotId && !legacy) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown modelSnapshotId' })
  }
  const legacyRangeId = legacy ? getModelRange(legacy).id : undefined
  if (input.modelRangeId && legacyRangeId && input.modelRangeId !== legacyRangeId) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Conflicting model range and version' })
  }
  const modelRangeId = input.modelRangeId ?? legacyRangeId
  const members = snapshots.filter((snapshot) => getModelRange(snapshot).id === modelRangeId)
  if (!members.length && !CURATED_LLM_CATALOG.some((entry) => entry.range.id === modelRangeId)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown modelRangeId' })
  }
  return { modelRangeId, modelSnapshotIds: members.map((snapshot) => snapshot.id).sort() }
}

/** A release is measured only after a valid decision is included in a published run. */
export async function findMeasuredModelSnapshots(
  database: typeof db,
  anchorDate: string,
  seasonId?: string,
) {
  return cachedPublicScoring(database, 'measured-model-ranges', { anchorDate, seasonId }, () =>
    database
      .selectDistinct({
        requestedModelId: benchmarkModelSnapshots.requestedModelId,
        provider: benchmarkModelSnapshots.provider,
        company: benchmarkModelSnapshots.company,
        modelFamily: benchmarkModelSnapshots.modelFamily,
        modelVersion: benchmarkModelSnapshots.modelVersion,
      })
      .from(benchmarkModelSnapshots)
      // A scalar subquery with LIMIT stops at the first valid measurement for each
      // snapshot instead of sorting every historical category decision for DISTINCT.
      .where(sql`(
        select ${benchmarkCaseResults.id}
        from ${benchmarkCases}
        join ${benchmarkCaseResults} on ${benchmarkCaseResults.caseId} = ${benchmarkCases.id}
        join ${benchmarkRuns} on ${benchmarkCaseResults.runId} = ${benchmarkRuns.id}
        join ${benchmarkSeasons} on ${benchmarkRuns.seasonId} = ${benchmarkSeasons.id}
        join ${benchmarkProtocols} on ${benchmarkSeasons.protocolId} = ${benchmarkProtocols.id}
        where ${and(
          eq(benchmarkCases.modelSnapshotId, benchmarkModelSnapshots.id),
          eq(benchmarkProtocols.mode, 'benchmark'),
          eq(benchmarkRuns.status, 'published'),
          lte(benchmarkRuns.scheduledFor, anchorDate),
          seasonId ? eq(benchmarkRuns.seasonId, seasonId) : undefined,
          eq(benchmarkCaseResults.status, 'completed'),
        )}
        and exists (select 1 from ${benchmarkCaseDecisions} where ${and(
          eq(benchmarkCaseDecisions.caseResultId, benchmarkCaseResults.id),
          eq(benchmarkCaseDecisions.resolutionStatus, 'resolved'),
          ne(benchmarkCaseDecisions.decisionType, 'invalid'),
        )})
        limit 1
      ) is not null`),
  )
}

export async function listMeasuredModelRanges(
  database: typeof db,
  anchorDate: string,
  seasonId?: string,
) {
  const ranges = summarizeModelRanges(
    await findMeasuredModelSnapshots(database, anchorDate, seasonId),
  )
  const companies: ModelFilterCompany[] = []
  for (const range of ranges) {
    let company = companies.find((entry) => entry.name === range.company)
    if (!company) {
      company = { name: range.company, ranges: [] }
      companies.push(company)
    }
    company.ranges.push({ id: range.id, name: range.name, label: range.label })
  }
  return companies
}

/** Public responses expose pooled ranges; internal scoring retains exact snapshot breakdowns. */
export async function publicRangeResults(
  database: typeof db,
  results: HeadToHeadResult[],
  anchorDate: string,
) {
  const ids = [...new Set(results.flatMap((result) => result.modelBreakdown.map((row) => row.id)))]
  if (!ids.length) return results
  const [snapshots, measured] = await Promise.all([
    database.query.benchmarkModelSnapshots.findMany({
      where: inArray(benchmarkModelSnapshots.id, ids),
    }),
    findMeasuredModelSnapshots(database, anchorDate),
  ])
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, getModelRange(snapshot)]))
  // Completed manual comparisons can contribute measurements too; never include pending versions.
  const labels = new Map(
    summarizeModelRanges([...measured, ...snapshots]).map((range) => [range.id, range.label]),
  )
  return results.map((result) => {
    const ranges = new Map<string, HeadToHeadResult['modelBreakdown'][number]>()
    for (const row of result.modelBreakdown) {
      const range = byId.get(row.id)
      if (!range) throw new Error('Missing snapshot for public range summary')
      const entry = ranges.get(range.id) ?? {
        ...row,
        id: range.id,
        label: labels.get(range.id) ?? range.name,
        aWins: 0,
        bWins: 0,
        abstains: 0,
        otherToolCount: 0,
        decisiveCaseCount: 0,
        aWinRate: 0,
      }
      entry.aWins += row.aWins
      entry.bWins += row.bWins
      entry.abstains += row.abstains
      entry.otherToolCount += row.otherToolCount
      entry.decisiveCaseCount = entry.aWins + entry.bWins
      entry.aWinRate = entry.decisiveCaseCount ? entry.aWins / entry.decisiveCaseCount : 0
      ranges.set(range.id, entry)
    }
    return {
      ...result,
      modelBreakdown: [...ranges.values()].sort((a, b) => a.label.localeCompare(b.label)),
    }
  })
}
