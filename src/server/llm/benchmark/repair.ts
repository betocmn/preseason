import { serverSettings } from '~/constants/server-settings'
import { extractBenchmarkNaturalResponse, PARSER_VERSION } from '~/server/llm/benchmark/parser'
import { type BenchmarkAppendix, validateBenchmarkAppendix } from '~/server/llm/benchmark/schema'
import type { LlmService } from '~/server/llm/service'

export const REPAIR_PARSER_VERSION = `${PARSER_VERSION}+repair-v1`

type RepairSuccess = {
  status: 'recovered'
  appendix: BenchmarkAppendix
  rawAppendix: string
  naturalResponse: string
  repairModel: string
}

type RepairFailure = {
  status: 'failed'
  reason: string
}

export type BenchmarkRepairResult = RepairSuccess | RepairFailure

function buildRepairSystemPrompt(eligibleCategorySlugs: string[]) {
  const categoryList = eligibleCategorySlugs.map((slug) => `- ${slug}`).join('\n')

  return [
    'You repair malformed benchmark outputs.',
    'Return ONLY valid JSON. Do not use code fences. Do not add commentary.',
    'Use exactly this shape:',
    '{"schema_version":"benchmark-v1","categories":[{"category_slug":"<slug>","decision":"tool|none","tool":"<ToolName>","reasoning":"<1-2 sentences>","confidence":0.0}]}',
    'Rules:',
    '- Return exactly one entry for each eligible category.',
    '- Use decision="tool" only when the source response recommends a concrete third-party tool.',
    '- Use decision="none" when no tool is recommended or implied for that category.',
    '- Omit "tool" when decision is "none".',
    '- Stay faithful to the source response and the original task. Do not invent product names.',
    'Eligible categories:',
    categoryList,
  ].join('\n')
}

function buildRepairUserPrompt(
  promptContentMd: string,
  rawResponse: string,
  eligibleCategorySlugs: string[],
) {
  return [
    'Original benchmark task:',
    promptContentMd,
    '',
    `Eligible categories: ${eligibleCategorySlugs.join(', ')}`,
    '',
    'Malformed assistant response to repair:',
    '<assistant_response>',
    rawResponse,
    '</assistant_response>',
  ].join('\n')
}

function stripJsonCodeFence(rawContent: string) {
  const trimmed = rawContent.trim()

  if (!trimmed.startsWith('```')) {
    return trimmed
  }

  const lines = trimmed.split('\n')
  if (lines.length < 2) {
    return trimmed
  }

  if (!lines[0]?.startsWith('```')) {
    return trimmed
  }

  const lastLine = lines[lines.length - 1]
  if (lastLine?.trim() !== '```') {
    return trimmed
  }

  return lines.slice(1, -1).join('\n').trim()
}

export async function repairBenchmarkResponse(
  llmService: LlmService,
  options: {
    promptContentMd: string
    rawResponse: string
    eligibleCategorySlugs: string[]
  },
): Promise<BenchmarkRepairResult> {
  const completion = await llmService.complete(
    serverSettings.benchmark.outputRepair.modelProvider,
    {
      model: serverSettings.benchmark.outputRepair.modelId,
      systemPrompt: buildRepairSystemPrompt(options.eligibleCategorySlugs),
      userPrompt: buildRepairUserPrompt(
        options.promptContentMd,
        options.rawResponse,
        options.eligibleCategorySlugs,
      ),
      temperature: serverSettings.benchmark.outputRepair.temperature,
      maxTokens: serverSettings.benchmark.outputRepair.maxTokens,
    },
  )

  const rawAppendix = stripJsonCodeFence(completion.content)

  let parsed: unknown
  try {
    parsed = JSON.parse(rawAppendix)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error'
    return {
      status: 'failed',
      reason: `Repair returned malformed JSON: ${message}`,
    }
  }

  const validation = validateBenchmarkAppendix(parsed, options.eligibleCategorySlugs)
  if (!validation.success) {
    return {
      status: 'failed',
      reason: `Repair returned invalid appendix: ${validation.error}`,
    }
  }

  return {
    status: 'recovered',
    appendix: validation.data,
    rawAppendix,
    naturalResponse: extractBenchmarkNaturalResponse(options.rawResponse),
    repairModel: completion.returnedModel,
  }
}
