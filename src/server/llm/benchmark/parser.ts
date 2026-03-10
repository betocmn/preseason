import { type BenchmarkAppendix, validateBenchmarkAppendix } from '~/server/llm/benchmark/schema'

export const PARSER_VERSION = 'strict-v1'

const OPEN_TAG = '<preseason_benchmark_json>'
const CLOSE_TAG = '</preseason_benchmark_json>'

export type ParseResult =
  | { status: 'ok'; appendix: BenchmarkAppendix; rawAppendix: string; naturalResponse: string }
  | { status: 'invalid_output'; reason: string }

export function parseBenchmarkResponse(
  rawContent: string,
  eligibleCategorySlugs: string[],
): ParseResult {
  const openIdx = rawContent.indexOf(OPEN_TAG)
  const closeIdx = openIdx === -1 ? -1 : rawContent.indexOf(CLOSE_TAG, openIdx + OPEN_TAG.length)

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
