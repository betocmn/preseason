import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '~/server/db/schema'
import { benchmarkModelSnapshots, llms } from '~/server/db/schema'
import { classifyModelTier, extractModelFamilyKey } from '~/server/llm/benchmark/model-tier'

export type ModelSnapshotParams = {
  temperature?: number | null
  topP?: number | null
  maxTokens?: number | null
  seed?: number | null
}

export function computeSnapshotKey(requestedModelId: string, params: ModelSnapshotParams): string {
  const temp = params.temperature ?? 'default'
  const topP = params.topP ?? 'default'
  const maxTokens = params.maxTokens ?? 'default'
  const seed = params.seed ?? 'default'
  return `${requestedModelId}:${temp}:${topP}:${maxTokens}:${seed}`
}

export async function getOrCreateModelSnapshot(
  database: PostgresJsDatabase<typeof schema>,
  llmId: string,
  params: ModelSnapshotParams,
) {
  const llm = await database.query.llms.findFirst({
    where: eq(llms.id, llmId),
  })

  if (!llm) {
    throw new Error(`LLM not found: ${llmId}`)
  }

  const requestedModelId = llm.modelId.trim()
  if (!requestedModelId) {
    throw new Error(`LLM ${llmId} has no modelId`)
  }

  const snapshotKey = computeSnapshotKey(requestedModelId, params)
  const tier = classifyModelTier(requestedModelId)
  const modelFamilyKey = extractModelFamilyKey(requestedModelId)
  const isDeterministic = params.seed !== undefined && params.seed !== null

  const [snapshot] = await database
    .insert(benchmarkModelSnapshots)
    .values({
      llmId,
      name: llm.name,
      provider: llm.provider,
      company: llm.company,
      modelFamily: llm.modelFamily,
      modelVersion: llm.modelVersion,
      tier,
      modelFamilyKey,
      requestedModelId,
      temperature: params.temperature ?? null,
      topP: params.topP ?? null,
      maxTokens: params.maxTokens ?? null,
      seed: params.seed ?? null,
      isDeterministic,
      snapshotKey,
    })
    .onConflictDoNothing({ target: benchmarkModelSnapshots.snapshotKey })
    .returning()

  if (!snapshot) {
    const conflicting = await database.query.benchmarkModelSnapshots.findFirst({
      where: eq(benchmarkModelSnapshots.snapshotKey, snapshotKey),
    })
    if (!conflicting) {
      throw new Error('Failed to create model snapshot')
    }
    if (conflicting.llmId !== llmId) {
      throw new Error(
        `Snapshot key "${snapshotKey}" already exists for a different LLM: ${conflicting.llmId}`,
      )
    }
    return conflicting
  }

  return snapshot
}
