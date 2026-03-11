import { type BenchmarkAppendix, validateBenchmarkAppendix } from '~/server/llm/benchmark/schema'

export const PARSER_VERSION = 'strict-v1'

const OPEN_TAG = '<preseason_benchmark_json>'
const CLOSE_TAG = '</preseason_benchmark_json>'

export type ParseResult =
  | { status: 'ok'; appendix: BenchmarkAppendix; rawAppendix: string; naturalResponse: string }
  | { status: 'invalid_output'; reason: string }

function findAppendixTagBlock(rawContent: string) {
  let searchFrom = rawContent.length

  while (searchFrom >= 0) {
    const openIdx = rawContent.lastIndexOf(OPEN_TAG, searchFrom)
    if (openIdx === -1) {
      return null
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

function findJsonTerminatedCloseTag(rawContent: string, contentStart: number) {
  let jsonStart = contentStart

  while (jsonStart < rawContent.length && /\s/u.test(rawContent[jsonStart] ?? '')) {
    jsonStart++
  }

  if (rawContent[jsonStart] !== '{') {
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

export function parseBenchmarkResponse(
  rawContent: string,
  eligibleCategorySlugs: string[],
): ParseResult {
  const tagBlock = findAppendixTagBlock(rawContent)
  const openIdx = tagBlock?.openIdx ?? -1
  const closeIdx = tagBlock?.closeIdx ?? -1

  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) {
    return { status: 'invalid_output', reason: 'Missing <preseason_benchmark_json> tags' }
  }

  const rawAppendix = rawContent.slice(openIdx + OPEN_TAG.length, closeIdx).trim()
  const naturalResponse = rawContent.slice(0, openIdx).trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(rawAppendix)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error'
    return { status: 'invalid_output', reason: `Malformed JSON: ${message}` }
  }

  const validation = validateBenchmarkAppendix(parsed, eligibleCategorySlugs)
  if (!validation.success) {
    return { status: 'invalid_output', reason: validation.error }
  }

  return { status: 'ok', appendix: validation.data, rawAppendix, naturalResponse }
}
