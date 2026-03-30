const COMMON_HOST_SUFFIXES = new Set([
  'ai',
  'app',
  'co',
  'cloud',
  'com',
  'dev',
  'fm',
  'gg',
  'io',
  'js',
  'ly',
  'me',
  'net',
  'org',
  'sh',
  'so',
  'tech',
])

function stripUrlFragments(value: string) {
  return value
    .replace(/^https?:\/\//u, '')
    .replace(/^www\./u, '')
    .replace(/[/?#].*$/u, '')
}

function stripParentheticalSegments(value: string) {
  return value.replace(/\([^)]*\)/gu, ' ')
}

function stripHostSuffix(token: string) {
  const trimmedToken = token.replace(/^[^a-z0-9]+|[^a-z0-9.:-]+$/giu, '')
  if (!trimmedToken.includes('.')) {
    return trimmedToken
  }

  const parts = trimmedToken.split('.').filter(Boolean)
  if (parts.length < 2) {
    return trimmedToken
  }

  const host = parts[0] ?? ''
  const suffixes = parts.slice(1)
  if (
    suffixes.length > 0 &&
    host.length > 0 &&
    suffixes.every((suffix) => COMMON_HOST_SUFFIXES.has(suffix))
  ) {
    return host
  }

  return trimmedToken
}

export function normalizeToolText(value: string): string {
  return value.toLowerCase().trim()
}

export function fingerprintToolText(value: string): string {
  const withoutUrlFragments = stripUrlFragments(normalizeToolText(value))
  const withoutParentheticals = stripParentheticalSegments(withoutUrlFragments)
  const hostNormalized = withoutParentheticals.split(/\s+/u).map(stripHostSuffix).join(' ')

  return hostNormalized
    .replace(/[+/_-]+/gu, ' ')
    .replace(/\./gu, ' ')
    .replace(/&/gu, ' and ')
    .replace(/[^a-z0-9\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}
