import { type BenchmarkAppendix, validateBenchmarkAppendix } from '~/server/llm/benchmark/schema'

export const PARSER_VERSION = 'strict-v3'

const OPEN_TAG = '<preseason_benchmark_json>'
const CLOSE_TAG = '</preseason_benchmark_json>'

type InvalidOutputParseResult = {
  status: 'invalid_output'
  reason: string
  appendixOpenIdx?: number
}

export type ParseResult =
  | { status: 'ok'; appendix: BenchmarkAppendix; rawAppendix: string; naturalResponse: string }
  | InvalidOutputParseResult

const REPAIRABLE_INVALID_OUTPUT_PATTERNS = [
  /^Truncated <preseason_benchmark_json> block:/u,
  /^Malformed <preseason_benchmark_json> block/u,
  /^Malformed JSON:/u,
] as const

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
        reason: 'Truncated <preseason_benchmark_json> block: missing JSON appendix',
        appendixOpenIdx: openIdx,
      }
    }

    if (rawContent.startsWith('```', contentStart)) {
      return {
        status: 'invalid_output',
        reason:
          'Malformed <preseason_benchmark_json> block: JSON must not be wrapped in a code fence',
        appendixOpenIdx: openIdx,
      }
    }

    if (rawContent[contentStart] !== '{' && rawContent[contentStart] !== '[') {
      foundOpeningTagWithoutJson = true
      searchFrom = openIdx - 1
      continue
    }

    const closeIdx = rawContent.indexOf(CLOSE_TAG, openIdx + OPEN_TAG.length)
    if (closeIdx === -1) {
      return {
        status: 'invalid_output',
        reason: 'Truncated <preseason_benchmark_json> block: missing closing tag',
        appendixOpenIdx: openIdx,
      }
    }

    return {
      status: 'invalid_output',
      reason: 'Malformed <preseason_benchmark_json> block',
      appendixOpenIdx: openIdx,
    }
  }

  if (foundOpeningTagWithoutJson) {
    return {
      status: 'invalid_output',
      reason: 'Opening <preseason_benchmark_json> tag without JSON appendix',
    }
  }

  return { status: 'invalid_output', reason: 'Missing <preseason_benchmark_json> tags' }
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

export function extractBenchmarkNaturalResponse(rawContent: string, appendixOpenIdx?: number) {
  const openIdx = appendixOpenIdx ?? rawContent.lastIndexOf(OPEN_TAG)
  if (openIdx === -1) {
    return rawContent.trim()
  }

  return rawContent.slice(0, openIdx).trim()
}

export function shouldRepairBenchmarkParseFailure(parseResult: ParseResult) {
  return (
    parseResult.status === 'invalid_output' &&
    REPAIRABLE_INVALID_OUTPUT_PATTERNS.some((pattern) => pattern.test(parseResult.reason))
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
      reason: `Malformed JSON: ${message}`,
      appendixOpenIdx: openIdx,
    }
  }

  const validation = validateBenchmarkAppendix(parsed, eligibleCategorySlugs)
  if (!validation.success) {
    return { status: 'invalid_output', reason: validation.error }
  }

  return { status: 'ok', appendix: validation.data, rawAppendix, naturalResponse }
}
