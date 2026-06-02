import { type BenchmarkAppendix, validateBenchmarkAppendix } from '~/server/llm/benchmark/schema'

export const PARSER_VERSION = 'strict-v4'

const OPEN_TAG = '<preseason_benchmark_json>'
const CLOSE_TAG = '</preseason_benchmark_json>'
const ALIAS_OPEN_TAGS = ['<appendix>', '<benchmark_json>'] as const

export type BenchmarkInvalidOutputCode =
  | 'blank_response'
  | 'missing_appendix_tags'
  | 'opening_tag_without_json_appendix'
  | 'truncated_appendix_block'
  | 'malformed_appendix_block'
  | 'malformed_json'
  | 'schema_invalid'

type InvalidOutputParseResult = {
  status: 'invalid_output'
  code: BenchmarkInvalidOutputCode
  reason: string
  repairBoundaryIdx?: number
}

export type ParseResult =
  | { status: 'ok'; appendix: BenchmarkAppendix; rawAppendix: string; naturalResponse: string }
  | InvalidOutputParseResult

const REPAIRABLE_INVALID_OUTPUT_CODES = new Set<BenchmarkInvalidOutputCode>([
  'missing_appendix_tags',
  'truncated_appendix_block',
  'malformed_appendix_block',
  'malformed_json',
  'schema_invalid',
])

function findAppendixTagBlock(rawContent: string) {
  let searchFrom = rawContent.length

  while (searchFrom >= 0) {
    const openIdx = rawContent.lastIndexOf(OPEN_TAG, searchFrom)
    if (openIdx === -1) {
      return null
    }

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

function explainMissingAppendixReason(rawContent: string): InvalidOutputParseResult {
  if (rawContent.trim().length === 0) {
    return { status: 'invalid_output', code: 'blank_response', reason: 'Blank response' }
  }

  let searchFrom = rawContent.length
  let foundOpeningTagWithoutJson = false

  while (searchFrom >= 0) {
    const openIdx = rawContent.lastIndexOf(OPEN_TAG, searchFrom)
    if (openIdx === -1) {
      break
    }

    const contentStart = findFirstNonWhitespaceIndex(rawContent, openIdx + OPEN_TAG.length)
    if (contentStart === -1) {
      return {
        status: 'invalid_output',
        code: 'truncated_appendix_block',
        reason: 'Truncated <preseason_benchmark_json> block: missing JSON appendix',
        repairBoundaryIdx: openIdx,
      }
    }

    if (rawContent.startsWith('```', contentStart)) {
      return {
        status: 'invalid_output',
        code: 'malformed_appendix_block',
        reason:
          'Malformed <preseason_benchmark_json> block: JSON must not be wrapped in a code fence',
        repairBoundaryIdx: openIdx,
      }
    }

    if (rawContent[contentStart] !== '{' && rawContent[contentStart] !== '[') {
      const closeIdx = rawContent.indexOf(CLOSE_TAG, openIdx + OPEN_TAG.length)
      if (closeIdx !== -1) {
        return {
          status: 'invalid_output',
          code: 'malformed_appendix_block',
          reason: 'Malformed <preseason_benchmark_json> block',
          repairBoundaryIdx: openIdx,
        }
      }

      foundOpeningTagWithoutJson = true
      searchFrom = openIdx - 1
      continue
    }

    const closeIdx =
      findJsonTerminatedCloseTag(rawContent, openIdx + OPEN_TAG.length) ??
      rawContent.indexOf(CLOSE_TAG, openIdx + OPEN_TAG.length)
    if (closeIdx === -1) {
      return {
        status: 'invalid_output',
        code: 'truncated_appendix_block',
        reason: 'Truncated <preseason_benchmark_json> block: missing closing tag',
        repairBoundaryIdx: openIdx,
      }
    }

    return {
      status: 'invalid_output',
      code: 'malformed_appendix_block',
      reason: 'Malformed <preseason_benchmark_json> block',
      repairBoundaryIdx: openIdx,
    }
  }

  if (foundOpeningTagWithoutJson) {
    return {
      status: 'invalid_output',
      code: 'opening_tag_without_json_appendix',
      reason: 'Opening <preseason_benchmark_json> tag without JSON appendix',
    }
  }

  return {
    status: 'invalid_output',
    code: 'missing_appendix_tags',
    reason: 'Missing <preseason_benchmark_json> tags',
    repairBoundaryIdx: findLikelyRepairBoundaryIndex(rawContent) ?? undefined,
  }
}

function findFirstNonWhitespaceIndex(rawContent: string, start: number) {
  let index = start
  while (index < rawContent.length && /\s/u.test(rawContent[index] ?? '')) {
    index++
  }

  return index < rawContent.length ? index : -1
}

function findJsonTerminatedCloseTag(rawContent: string, contentStart: number) {
  const jsonStart = findFirstNonWhitespaceIndex(rawContent, contentStart)
  if (jsonStart === -1) {
    return null
  }

  if (rawContent[jsonStart] !== '{' && rawContent[jsonStart] !== '[') {
    return null
  }

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
      if (char === '\\') {
        isEscaped = true
      } else if (char === '"') {
        inString = false
      }
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
      if (depth !== 0) {
        continue
      }

      let closeIdx = idx + 1
      while (closeIdx < rawContent.length && /\s/u.test(rawContent[closeIdx] ?? '')) {
        closeIdx++
      }

      return rawContent.startsWith(CLOSE_TAG, closeIdx) ? closeIdx : null
    }
  }

  return null
}

function startsStructuredAppendixBlock(rawContent: string, openIdx: number, openTag: string) {
  const contentStart = findFirstNonWhitespaceIndex(rawContent, openIdx + openTag.length)
  return (
    contentStart !== -1 &&
    (rawContent[contentStart] === '{' ||
      rawContent[contentStart] === '[' ||
      rawContent.startsWith('```', contentStart))
  )
}

function findStructuredTagBoundaryIndex(rawContent: string, openTag: string) {
  let searchFrom = rawContent.length

  while (searchFrom >= 0) {
    const openIdx = rawContent.lastIndexOf(openTag, searchFrom)
    if (openIdx === -1) {
      return null
    }

    if (startsStructuredAppendixBlock(rawContent, openIdx, openTag)) {
      return openIdx
    }

    searchFrom = openIdx - 1
  }

  return null
}

function isStandaloneTagLine(rawContent: string, openIdx: number, openTag: string) {
  const lineStartIdx = rawContent.lastIndexOf('\n', openIdx - 1) + 1
  if (rawContent.slice(lineStartIdx, openIdx).trim().length > 0) {
    return false
  }

  const tagLineEndIdx = rawContent.indexOf('\n', openIdx + openTag.length)
  const lineRemainder =
    tagLineEndIdx === -1
      ? rawContent.slice(openIdx + openTag.length)
      : rawContent.slice(openIdx + openTag.length, tagLineEndIdx)

  return lineRemainder.trim().length === 0
}

function findAliasTagBoundaryIndex(rawContent: string, openTag: string) {
  let searchFrom = rawContent.length

  while (searchFrom >= 0) {
    const openIdx = rawContent.lastIndexOf(openTag, searchFrom)
    if (openIdx === -1) {
      return null
    }

    if (startsStructuredAppendixBlock(rawContent, openIdx, openTag)) {
      return openIdx
    }

    const contentStart = findFirstNonWhitespaceIndex(rawContent, openIdx + openTag.length)
    if (contentStart !== -1 && isStandaloneTagLine(rawContent, openIdx, openTag)) {
      return openIdx
    }

    searchFrom = openIdx - 1
  }

  return null
}

function findLikelyRepairBoundaryIndex(rawContent: string) {
  let boundaryIdx: number | null = null

  const exactTagBoundary = findStructuredTagBoundaryIndex(rawContent, OPEN_TAG)
  if (exactTagBoundary != null) {
    boundaryIdx = exactTagBoundary
  }

  for (const tag of ALIAS_OPEN_TAGS) {
    const tagBoundary = findAliasTagBoundaryIndex(rawContent, tag)
    if (tagBoundary != null && (boundaryIdx == null || tagBoundary > boundaryIdx)) {
      boundaryIdx = tagBoundary
    }
  }

  if (boundaryIdx != null) {
    return boundaryIdx
  }

  const jsonStart = findFirstNonWhitespaceIndex(rawContent, 0)
  if (jsonStart === -1) {
    return null
  }

  return rawContent[jsonStart] === '{' || rawContent[jsonStart] === '[' ? jsonStart : null
}

export function extractBenchmarkNaturalResponse(rawContent: string, repairBoundaryIdx?: number) {
  const boundaryIdx = repairBoundaryIdx ?? findLikelyRepairBoundaryIndex(rawContent)
  if (boundaryIdx == null || boundaryIdx === -1) {
    return rawContent.trim()
  }

  return rawContent.slice(0, boundaryIdx).trim()
}

export function shouldRepairBenchmarkParseFailure(parseResult: ParseResult) {
  return (
    parseResult.status === 'invalid_output' && REPAIRABLE_INVALID_OUTPUT_CODES.has(parseResult.code)
  )
}

export function parseBenchmarkResponse(
  rawContent: string,
  eligibleCategorySlugs: string[],
): ParseResult {
  const tagBlock = findAppendixTagBlock(rawContent)
  const openIdx = tagBlock?.openIdx ?? -1
  const closeIdx = tagBlock?.closeIdx ?? -1

  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) {
    return explainMissingAppendixReason(rawContent)
  }

  const rawAppendix = rawContent.slice(openIdx + OPEN_TAG.length, closeIdx).trim()
  const naturalResponse = extractBenchmarkNaturalResponse(rawContent, openIdx)

  let parsed: unknown
  try {
    parsed = JSON.parse(rawAppendix)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error'
    return {
      status: 'invalid_output',
      code: 'malformed_json',
      reason: `Malformed JSON: ${message}`,
      repairBoundaryIdx: openIdx,
    }
  }

  const validation = validateBenchmarkAppendix(parsed, eligibleCategorySlugs)
  if (!validation.success) {
    return {
      status: 'invalid_output',
      code: 'schema_invalid',
      reason: validation.error,
      repairBoundaryIdx: openIdx,
    }
  }

  return { status: 'ok', appendix: validation.data, rawAppendix, naturalResponse }
}
