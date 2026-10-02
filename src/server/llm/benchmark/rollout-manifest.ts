import { createHash } from 'node:crypto'
import { serverSettings } from '~/constants/server-settings'
import { CURATED_LLM_CATALOG } from '~/server/llm/catalog'
import { resolveModelSnapshotParams } from './model-snapshotter'

/** Verifies that the deployment and rollout script use the same panel and runtime contract. */
export function getRangeRolloutManifest() {
  const settings = serverSettings.benchmark
  const contract = {
    version: settings.rangeRollout.version,
    schedule: { days: settings.newRunUtcMonthDays, hour: settings.newRunStartUtcHour },
    models: CURATED_LLM_CATALOG.filter((entry) => !entry.archived).map((entry) => ({
      modelId: entry.modelId,
      tier: entry.tier,
      rangeId: entry.range.id,
      params: resolveModelSnapshotParams(entry.modelId, settings.modelDefaults),
    })),
  }
  return {
    ...contract,
    fingerprint: createHash('sha256').update(JSON.stringify(contract)).digest('hex'),
  }
}
