import { createHash } from 'node:crypto'
import type { PromptLevel } from '~/server/llm/prompts'

export function buildBenchmarkPromptVersionHash(input: {
  contentMd: string
  level: PromptLevel
  systemPromptSnapshot: string
  promptContractVersion: string
}) {
  return createHash('sha256')
    .update(input.contentMd)
    .update('\0')
    .update(input.level)
    .update('\0')
    .update(input.systemPromptSnapshot)
    .update('\0')
    .update(input.promptContractVersion)
    .digest('hex')
}
