export type DriftCheckResult = {
  hasDrift: boolean
  requestedModel: string
  returnedModel: string
}

const SNAPSHOT_SUFFIX_PATTERN = /(?:[-_](?:\d{4}-\d{2}-\d{2}|(?:19|20)\d{6}|\d{4,8}))$/u

function normalizeForComparison(id: string): string {
  const parts = id.split('/')
  const name = parts.length > 1 ? parts.slice(1).join('/') : id
  return name.toLowerCase().trim()
}

function hasExplicitSnapshotSuffix(name: string): boolean {
  return SNAPSHOT_SUFFIX_PATTERN.test(name)
}

function stripTrailingSnapshotSuffixes(name: string): string {
  let current = name

  while (true) {
    const next = current.replace(SNAPSHOT_SUFFIX_PATTERN, '')
    if (next === current) {
      return current
    }
    current = next
  }
}

function canonicalizeAlias(name: string): string {
  return stripTrailingSnapshotSuffixes(name)
    .split(/[-_]/u)
    .filter((token) => token.length > 0)
    .sort()
    .join(':')
}

export function checkModelDrift(requestedModel: string, returnedModel: string): DriftCheckResult {
  const normalizedRequested = normalizeForComparison(requestedModel)
  const normalizedReturned = normalizeForComparison(returnedModel)
  const hasDrift = hasExplicitSnapshotSuffix(normalizedRequested)
    ? normalizedRequested !== normalizedReturned
    : canonicalizeAlias(normalizedRequested) !== canonicalizeAlias(normalizedReturned)

  return {
    hasDrift,
    requestedModel,
    returnedModel,
  }
}
