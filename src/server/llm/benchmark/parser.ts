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

    const closeIdx = rawContent.indexOf(CLOSE_TAG, openIdx + OPEN_TAG.length)
    if (closeIdx !== -1) {
      return { openIdx, closeIdx }
    }

    searchFrom = openIdx - 1
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
