import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const PROMPTS_DIR = import.meta.dirname

export type PromptLevel = 'software-dev-beginner' | 'software-dev-experienced' | 'vibe-coder'

export async function getPromptContent(
  slug: string,
  level: PromptLevel = 'vibe-coder',
): Promise<string> {
  const filePath = join(PROMPTS_DIR, level, `${slug}.md`)
  const content = await readFile(filePath, 'utf-8')
  return content.trim()
}
