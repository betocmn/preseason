import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const PROMPTS_DIR = join(process.cwd(), 'src/server/llm/prompts')

export const PROMPT_LEVELS = [
  'software-dev-beginner',
  'software-dev-experienced',
  'vibe-coder',
] as const

export type PromptLevel = (typeof PROMPT_LEVELS)[number]

export function isPromptLevel(value: string): value is PromptLevel {
  return (PROMPT_LEVELS as readonly string[]).includes(value)
}

export async function getPromptContent(
  slug: string,
  level: PromptLevel = 'vibe-coder',
): Promise<string> {
  const filePath = join(PROMPTS_DIR, level, `${slug}.md`)
  const content = await readFile(filePath, 'utf-8')
  return content.trim()
}
