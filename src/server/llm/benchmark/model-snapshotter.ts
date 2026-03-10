import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '~/server/db/schema'
import { benchmarkModelSnapshots, llms } from '~/server/db/schema'
import { classifyModelTier, extractModelFamilyKey } from '~/server/llm/benchmark/model-tier'

export type ModelSnapshotParams = {
  requestedModelId: string
  temperature?: number | null
  topP?: number | null
  maxTokens?: number | null
  seed?: number | null
}

export function computeSnapshotKey(params: ModelSnapshotParams): string {
  const temp = params.temperature ?? 'default'
  const topP = params.topP ?? 'default'
  const maxTokens = params.maxTokens ?? 'default'
  const seed = params.seed ?? 'default'
  return `${params.requestedModelId}:${temp}:${topP}:${maxTokens}:${seed}`
}

export async function getOrCreateModelSnapshot(
  database: PostgresJsDatabase<typeof schema>,
  llmId: string,
  params: ModelSnapshotParams,
) {
  const snapshotKey = computeSnapshotKey(params)

  const existing = await database.query.benchmarkModelSnapshots.findFirst({
    where: eq(benchmarkModelSnapshots.snapshotKey, snapshotKey),
  })

  if (existing) {
    if (existing.llmId !== llmId) {
      throw new Error(
        `Snapshot key "${snapshotKey}" already exists for a different LLM: ${existing.llmId}`,
      )
    }
    return existing
  }

  const llm = await database.query.llms.findFirst({
    where: eq(llms.id, llmId),
  })

  if (!llm) {
    throw new Error(`LLM not found: ${llmId}`)
  }

  const tier = classifyModelTier(params.requestedModelId)
  const modelFamilyKey = extractModelFamilyKey(params.requestedModelId)
  const isDeterministic = params.seed !== undefined && params.seed !== null

  const [snapshot] = await database
    .insert(benchmarkModelSnapshots)
    .values({
      llmId,
      name: llm.name,
      provider: llm.provider,
      tier,
      modelFamilyKey,
      requestedModelId: params.requestedModelId,
      temperature: params.temperature ?? null,
      topP: params.topP ?? null,
      maxTokens: params.maxTokens ?? null,
      seed: params.seed ?? null,
      isDeterministic,
      snapshotKey,
    })
    .returning()

  if (!snapshot) {
    throw new Error('Failed to create model snapshot')
  }

  return snapshot
}
