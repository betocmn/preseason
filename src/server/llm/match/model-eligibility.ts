import { serverSettings } from '~/constants/server-settings'

const excludedRequestedModelIds = new Set(
  serverSettings.match.excludedRequestedModelIds.map((modelId) => modelId.toLowerCase()),
)

export function isMatchEligibleRequestedModelId(requestedModelId: string) {
  return !excludedRequestedModelIds.has(requestedModelId.trim().toLowerCase())
}
