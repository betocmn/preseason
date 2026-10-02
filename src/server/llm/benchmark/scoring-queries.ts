import { and, eq, inArray, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '~/server/db/schema'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkModelSnapshots,
  benchmarkModelWeightConfigs,
  benchmarkPromptVersions,
  benchmarkRuns,
} from '~/server/db/schema'
import type { HeadToHeadFilters, ScoringFilters } from './scoring'

type DatabaseClient = PostgresJsDatabase<typeof schema>
type DecisionFilters = Pick<
  ScoringFilters,
  'promptLevel' | 'modelTier' | 'modelSnapshotId' | 'modelSnapshotIds'
>

// Keep history inside Postgres. Only aggregate counts/coverage leave the database.
function eligibleDecisions(runIds: string[], categoryIds: string[], filters: DecisionFilters) {
  return sql`
    select
      ${benchmarkCaseDecisions.categoryId} as category_id,
      case when ${benchmarkCaseDecisions.decisionType} = 'tool'
        then ${benchmarkCaseDecisions.toolId} end as tool_id,
      ${benchmarkCaseDecisions.decisionType} as decision_type,
      ${benchmarkModelSnapshots.id} as model_id,
      ${benchmarkModelSnapshots.name} as model_name,
      ${benchmarkModelSnapshots.tier} as model_tier,
      ${benchmarkPromptVersions.id} as prompt_id,
      ${benchmarkPromptVersions.slug} as prompt_slug,
      ${benchmarkPromptVersions.level} as prompt_level,
      (case ${benchmarkModelSnapshots.tier}
        when 'frontier' then coalesce(${benchmarkModelWeightConfigs.frontierWeight}, 1)
        when 'mid' then coalesce(${benchmarkModelWeightConfigs.midWeight}, 1)
        else coalesce(${benchmarkModelWeightConfigs.smallWeight}, 1)
      end)::text::double precision as weight
    from ${benchmarkCaseDecisions}
    join ${benchmarkCaseResults} on ${benchmarkCaseDecisions.caseResultId} = ${benchmarkCaseResults.id}
    join ${benchmarkCases} on ${benchmarkCaseResults.caseId} = ${benchmarkCases.id}
    join ${benchmarkModelSnapshots} on ${benchmarkCases.modelSnapshotId} = ${benchmarkModelSnapshots.id}
    join ${benchmarkPromptVersions} on ${benchmarkCases.promptVersionId} = ${benchmarkPromptVersions.id}
    join ${benchmarkRuns} on ${benchmarkCaseResults.runId} = ${benchmarkRuns.id}
    left join ${benchmarkModelWeightConfigs} on ${benchmarkRuns.weightConfigId} = ${benchmarkModelWeightConfigs.id}
    where ${and(
      inArray(benchmarkCaseDecisions.categoryId, categoryIds),
      inArray(benchmarkCaseResults.runId, runIds),
      eq(benchmarkCaseResults.status, 'completed'),
      eq(benchmarkCaseDecisions.resolutionStatus, 'resolved'),
      sql`${benchmarkCaseDecisions.decisionType} != 'invalid'`,
      filters.promptLevel ? eq(benchmarkPromptVersions.level, filters.promptLevel) : undefined,
      filters.modelTier ? eq(benchmarkModelSnapshots.tier, filters.modelTier) : undefined,
      filters.modelSnapshotId ? eq(benchmarkModelSnapshots.id, filters.modelSnapshotId) : undefined,
      filters.modelSnapshotIds
        ? inArray(benchmarkModelSnapshots.id, filters.modelSnapshotIds)
        : undefined,
    )}
  `
}

export type RankingAggregate = {
  categoryId: string | null
  toolId: string | null
  isTotal: number
  count: number
  weight: number
  models: number
  prompts: number
}

export async function queryRankingAggregates(
  db: DatabaseClient,
  runIds: string[],
  categoryIds: string[],
  filters: DecisionFilters,
  splitCategories: boolean,
): Promise<RankingAggregate[]> {
  if (!runIds.length || !categoryIds.length) return []

  return db.execute<RankingAggregate>(sql`
    with eligible as (${eligibleDecisions(runIds, categoryIds, filters)})
    select ${splitCategories ? sql`category_id` : sql`null::uuid`} as "categoryId",
      tool_id as "toolId", grouping(tool_id) as "isTotal",
      count(*)::integer as count, coalesce(sum(weight), 0) as weight,
      count(distinct model_id)::integer as models,
      count(distinct prompt_id)::integer as prompts
    from eligible
    group by grouping sets ${splitCategories ? sql`((category_id), (category_id, tool_id))` : sql`((), (tool_id))`}
  `)
}

export type HeadToHeadAggregate = {
  modelId: string | null
  modelName: string | null
  modelTier: 'frontier' | 'mid' | 'small' | null
  promptId: string | null
  promptSlug: string | null
  promptLevel: 'beginner' | 'intermediate' | 'advanced' | null
  aWins: number
  bWins: number
  abstains: number
  otherToolCount: number
  weightedAWins: number
  weightedBWins: number
}

export async function queryHeadToHeadAggregates(
  db: DatabaseClient,
  runIds: string[],
  filters: HeadToHeadFilters,
): Promise<HeadToHeadAggregate[]> {
  const rows = await queryHeadToHeadBatchAggregates(db, runIds, [filters], filters)
  return rows.map(({ pairIndex: _pairIndex, ...row }) => row)
}

export type HeadToHeadPair = Pick<HeadToHeadFilters, 'categoryId' | 'toolAId' | 'toolBId'>
export type HeadToHeadBatchAggregate = HeadToHeadAggregate & { pairIndex: number }

/** Scan published decisions once, even when a page compares many categories. */
export async function queryHeadToHeadBatchAggregates(
  db: DatabaseClient,
  runIds: string[],
  pairs: HeadToHeadPair[],
  filters: DecisionFilters,
): Promise<HeadToHeadBatchAggregate[]> {
  if (!runIds.length || !pairs.length) return []

  const pairValues = pairs.map(
    (pair, index) =>
      sql`(${index}::integer, ${pair.categoryId}::uuid, ${pair.toolAId}::uuid, ${pair.toolBId}::uuid)`,
  )
  const categoryIds = [...new Set(pairs.map((pair) => pair.categoryId))]

  return db.execute<HeadToHeadBatchAggregate>(sql`
    with eligible as (${eligibleDecisions(runIds, categoryIds, filters)}),
    pairs(pair_index, category_id, tool_a_id, tool_b_id) as (values ${sql.join(pairValues, sql`, `)}),
    outcomes as (
      select eligible.*, pairs.pair_index, case
        when tool_id = pairs.tool_a_id then 'a'
        when tool_id = pairs.tool_b_id then 'b'
        when decision_type = 'none' then 'none'
        else 'other' end as outcome
      from eligible
      join pairs on eligible.category_id = pairs.category_id
        and pairs.tool_a_id <> pairs.tool_b_id
    )
    select pair_index as "pairIndex",
      model_id as "modelId", model_name as "modelName", model_tier as "modelTier",
      prompt_id as "promptId", prompt_slug as "promptSlug", prompt_level as "promptLevel",
      count(*) filter (where outcome = 'a')::integer as "aWins",
      count(*) filter (where outcome = 'b')::integer as "bWins",
      count(*) filter (where outcome = 'none')::integer as abstains,
      count(*) filter (where outcome = 'other')::integer as "otherToolCount",
      coalesce(sum(weight) filter (where outcome = 'a'), 0) as "weightedAWins",
      coalesce(sum(weight) filter (where outcome = 'b'), 0) as "weightedBWins"
    from outcomes
    group by grouping sets (
      (pair_index),
      (pair_index, model_id, model_name, model_tier),
      (pair_index, prompt_id, prompt_slug, prompt_level)
    )
  `)
}
