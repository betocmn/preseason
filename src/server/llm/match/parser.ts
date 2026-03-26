import { type MatchResponse, validateMatchResponse } from '~/server/llm/match/schema'

export const MATCH_PARSER_VERSION = 'match-repair-v1'

const OPEN_TAG = '<preseason_match_json>'
const CLOSE_TAG = '</preseason_match_json>'

export type MatchParseResult =
  | { status: 'ok'; response: MatchResponse; rawAppendix: string; naturalResponse: string }
  | { status: 'invalid_output'; reason: string }

const KEY_ALIASES = new Map<string, string>([
  ['schemaversion', 'schema_version'],
  ['comparisonsummary', 'comparison_summary'],
  ['toola', 'tool_a'],
  ['toolb', 'tool_b'],
  ['evidencesentence', 'evidence_sentence'],
  ['eevidencesentence', 'evidence_sentence'],
  ['evidenceevidencesentence', 'evidence_sentence'],
])

function findFirstNonWhitespaceIndex(rawContent: string, start: number) {
  let index = start
  while (index < rawContent.length && /\s/u.test(rawContent[index] ?? '')) {
    index++
  }
  return index < rawContent.length ? index : -1
}

function findJsonTerminatedCloseTag(rawContent: string, contentStart: number) {
  const jsonStart = findFirstNonWhitespaceIndex(rawContent, contentStart)
  if (jsonStart === -1) return null
  if (rawContent[jsonStart] !== '{' && rawContent[jsonStart] !== '[') return null

  let depth = 0
  let inString = false
  let isEscaped = false

  for (let idx = jsonStart; idx < rawContent.length; idx++) {
    const char = rawContent[idx]
    if (char === undefined) break

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (inString) {
      if (char === '\\') isEscaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{' || char === '[') {
      depth++
      continue
    }

    if (char === '}' || char === ']') {
      depth--
      if (depth !== 0) continue

      let closeIdx = idx + 1
      while (closeIdx < rawContent.length && /\s/u.test(rawContent[closeIdx] ?? '')) {
        closeIdx++
      }

      return rawContent.startsWith(CLOSE_TAG, closeIdx) ? closeIdx : null
    }
  }

  return null
}

function findAppendixTagBlock(rawContent: string) {
  let searchFrom = rawContent.length

  while (searchFrom >= 0) {
    const openIdx = rawContent.lastIndexOf(OPEN_TAG, searchFrom)
    if (openIdx === -1) return null

    const contentStart = findFirstNonWhitespaceIndex(rawContent, openIdx + OPEN_TAG.length)
    if (
      contentStart === -1 ||
      (rawContent[contentStart] !== '{' && rawContent[contentStart] !== '[')
    ) {
      searchFrom = openIdx - 1
      continue
    }

    const closeIdx =
      findJsonTerminatedCloseTag(rawContent, openIdx + OPEN_TAG.length) ??
      rawContent.indexOf(CLOSE_TAG, openIdx + OPEN_TAG.length)
    if (closeIdx !== -1) {
      return { openIdx, closeIdx }
    }

    searchFrom = openIdx - 1
  }

  return null
}

function stripMarkdownCodeFence(rawAppendix: string) {
  const trimmed = rawAppendix.trim()
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/u)
  return fencedMatch?.[1]?.trim() ?? trimmed
}

function repairMissingAnalysisArrayClosures(rawAppendix: string) {
  return rawAppendix.replace(/(\})(\s*,\s*"cons"\s*:)/gu, '$1]$2')
}

function canonicalizeKey(key: string) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, '')
  return KEY_ALIASES.get(normalized) ?? key
}

function normalizeMatchPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeMatchPayload(item))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const entries = Object.entries(value)
  const normalizedObject: Record<string, unknown> = {}

  for (const [key, entryValue] of entries) {
    const canonicalKey = canonicalizeKey(key)
    if (!(canonicalKey in normalizedObject)) {
      normalizedObject[canonicalKey] = normalizeMatchPayload(entryValue)
      continue
    }

    if (key === canonicalKey) {
      normalizedObject[canonicalKey] = normalizeMatchPayload(entryValue)
    }
  }

  return normalizedObject
}

function parseAppendixJson(rawAppendix: string) {
  const stripped = stripMarkdownCodeFence(rawAppendix)
  const candidates = [stripped, repairMissingAnalysisArrayClosures(stripped)]

  let lastError: unknown

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const normalizedPayload = normalizeMatchPayload(parsed)
      const normalizedPayloadJson = JSON.stringify(normalizedPayload)
      return {
        parsed: normalizedPayload,
        normalizedAppendix:
          candidate === rawAppendix && JSON.stringify(parsed) === normalizedPayloadJson
            ? rawAppendix
            : normalizedPayloadJson,
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

export function parseMatchResponse(rawContent: string): MatchParseResult {
  const tagBlock = findAppendixTagBlock(rawContent)
  const openIdx = tagBlock?.openIdx ?? -1
  const closeIdx = tagBlock?.closeIdx ?? -1

  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) {
    return { status: 'invalid_output', reason: 'Missing <preseason_match_json> tags' }
  }

  const rawAppendix = rawContent.slice(openIdx + OPEN_TAG.length, closeIdx).trim()
  const naturalResponse = rawContent.slice(0, openIdx).trim()

  let parsed: unknown
  let normalizedAppendix = rawAppendix
  try {
    const parsedResult = parseAppendixJson(rawAppendix)
    parsed = parsedResult.parsed
    normalizedAppendix = parsedResult.normalizedAppendix
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error'
    return { status: 'invalid_output', reason: `Malformed JSON: ${message}` }
  }

  const validation = validateMatchResponse(parsed)
  if (!validation.success) {
    return { status: 'invalid_output', reason: validation.error }
  }

  return {
    status: 'ok',
    response: validation.data,
    rawAppendix: normalizedAppendix,
    naturalResponse,
  }
}
