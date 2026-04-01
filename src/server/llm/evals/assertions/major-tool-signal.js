// @ts-nocheck
const fs = require('node:fs')

const OPEN_TAG = '<preseason_benchmark_json>'
const CLOSE_TAG = '</preseason_benchmark_json>'
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

let catalogCache = null
let catalogCachePath = null

function fail(reason) {
  return {
    pass: false,
    score: 0,
    reason,
  }
}

function normalizeToolText(value) {
  return String(value).toLowerCase().trim()
}

function stripUrlFragments(value) {
  return value
    .replace(/^https?:\/\//u, '')
    .replace(/^www\./u, '')
    .replace(/[/?#].*$/u, '')
}

function stripParentheticalSegments(value) {
  return value.replace(/\([^)]*\)/gu, ' ')
}

function stripHostSuffix(token) {
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

function fingerprintToolText(value) {
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

function extractAppendix(output) {
  const openIndex = output.lastIndexOf(OPEN_TAG)
  const closeIndex = output.indexOf(CLOSE_TAG, openIndex + OPEN_TAG.length)
  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) {
    throw new Error('Missing preseason benchmark appendix tags')
  }

  return JSON.parse(output.slice(openIndex + OPEN_TAG.length, closeIndex).trim())
}

function loadCatalog(catalogPath) {
  if (!catalogPath) {
    throw new Error('tool_catalog_path is required')
  }

  if (catalogCache && catalogCachePath === catalogPath) {
    return catalogCache
  }

  catalogCache = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  catalogCachePath = catalogPath
  return catalogCache
}

function matchesKnownTool(toolName, catalog) {
  const normalized = normalizeToolText(toolName)
  const fingerprint = fingerprintToolText(toolName)

  if (
    catalog.knownNormalizedTerms.includes(normalized) ||
    catalog.knownFingerprints.includes(fingerprint)
  ) {
    return true
  }

  return catalog.knownBrandTokens.some((brandToken) => fingerprint.split(' ').includes(brandToken))
}

function looksGeneric(toolName, catalog) {
  const normalized = normalizeToolText(toolName)
  const fingerprint = fingerprintToolText(toolName)
  const tokens = fingerprint.split(' ').filter(Boolean)

  if (
    catalog.blockedExactPhrases.includes(normalized) ||
    catalog.blockedExactPhrases.includes(fingerprint)
  ) {
    return true
  }

  if (tokens.some((token) => catalog.blockedTokens.includes(token))) {
    return true
  }

  if (tokens.length === 0) {
    return true
  }

  if (tokens.length === 1 && catalog.blockedSingleTokens.includes(tokens[0])) {
    return true
  }

  return tokens.every((token) => catalog.genericVocabulary.includes(token))
}

module.exports = (output, { vars }) => {
  if (typeof output !== 'string' || output.trim().length === 0) {
    return fail('Model output is empty')
  }

  let appendix
  try {
    appendix = extractAppendix(output)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error'
    return fail(message)
  }

  const catalog = loadCatalog(vars.tool_catalog_path)
  const lowSignalTools = []

  for (const category of appendix.categories ?? []) {
    if (!category || category.decision !== 'tool' || typeof category.tool !== 'string') {
      continue
    }

    if (matchesKnownTool(category.tool, catalog)) {
      continue
    }

    if (looksGeneric(category.tool, catalog)) {
      lowSignalTools.push(`${category.category_slug}: ${category.tool}`)
    }
  }

  if (lowSignalTools.length > 0) {
    return fail(`Low-signal tool names detected: ${lowSignalTools.join('; ')}`)
  }

  return {
    pass: true,
    score: 1,
    reason: 'All tool decisions look like branded or materially specific choices',
  }
}
