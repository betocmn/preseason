export type DriftCheckResult = {
  hasDrift: boolean
  requestedModel: string
  returnedModel: string
}

function normalizeForComparison(id: string): string {
  const parts = id.split('/')
  const name = parts.length > 1 ? parts.slice(1).join('/') : id
  return name.toLowerCase().trim()
}

export function checkModelDrift(requestedModel: string, returnedModel: string): DriftCheckResult {
  const normalizedRequested = normalizeForComparison(requestedModel)
  const normalizedReturned = normalizeForComparison(returnedModel)

  return {
    hasDrift: normalizedRequested !== normalizedReturned,
    requestedModel,
    returnedModel,
  }
}
