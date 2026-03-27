import { isNotNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '~/server/db/schema'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkModelSnapshots,
  benchmarkModelWeightConfigs,
  benchmarkPromptVersionCategories,
  benchmarkPromptVersions,
  benchmarkProtocols,
  benchmarkRuns,
  benchmarkSeasonModels,
  benchmarkSeasonPrompts,
  benchmarkSeasons,
  matchBatches,
  matchConfigs,
  matchEvaluations,
} from '~/server/db/schema'

type DatabaseClient = PostgresJsDatabase<typeof schema>

export async function cleanBenchmarkData(database: DatabaseClient): Promise<void> {
  await database.delete(matchEvaluations).where(isNotNull(matchEvaluations.id))
  await database.delete(matchBatches).where(isNotNull(matchBatches.id))
  await database.delete(matchConfigs).where(isNotNull(matchConfigs.id))
  await database.delete(benchmarkCaseDecisions).where(isNotNull(benchmarkCaseDecisions.id))
  await database.delete(benchmarkCaseResults).where(isNotNull(benchmarkCaseResults.id))
  await database.delete(benchmarkRuns).where(isNotNull(benchmarkRuns.id))
  await database.delete(benchmarkCases).where(isNotNull(benchmarkCases.id))
  await database.delete(benchmarkSeasonModels).where(isNotNull(benchmarkSeasonModels.seasonId))
  await database.delete(benchmarkSeasonPrompts).where(isNotNull(benchmarkSeasonPrompts.seasonId))
  await database
    .delete(benchmarkPromptVersionCategories)
    .where(isNotNull(benchmarkPromptVersionCategories.promptVersionId))
  await database.delete(benchmarkPromptVersions).where(isNotNull(benchmarkPromptVersions.id))
  await database.delete(benchmarkModelSnapshots).where(isNotNull(benchmarkModelSnapshots.id))
  await database.delete(benchmarkSeasons).where(isNotNull(benchmarkSeasons.id))
  await database.delete(benchmarkProtocols).where(isNotNull(benchmarkProtocols.id))
  await database
    .delete(benchmarkModelWeightConfigs)
    .where(isNotNull(benchmarkModelWeightConfigs.id))
}
