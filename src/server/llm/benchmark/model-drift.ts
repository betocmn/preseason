export type DriftCheckResult = {
  hasDrift: boolean
  requestedModel: string
  returnedModel: string
}

const SNAPSHOT_SUFFIX_PATTERN = /(?:[-_](?:\d{4}-\d{2}-\d{2}|(?:19|20)\d{6}|\d{4,8}))$/u
const LLAMA_OPENROUTER_ALIAS_PATTERNS = [
  { pattern: /^llama-4-maverick-\d+b-\d+e-instruct$/u, canonical: 'llama-4-maverick' },
  { pattern: /^llama-4-scout-\d+b-\d+e-instruct$/u, canonical: 'llama-4-scout' },
] as const

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

function stripKnownAliasDecorators(name: string) {
  for (const alias of LLAMA_OPENROUTER_ALIAS_PATTERNS) {
    if (alias.pattern.test(name)) {
      return alias.canonical
    }
  }

  return name
}

function canonicalizeAlias(name: string): string {
  return stripKnownAliasDecorators(stripTrailingSnapshotSuffixes(name))
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
