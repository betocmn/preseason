import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as schema from '~/server/db/schema'
import { prompts } from '~/server/db/schema'

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
  database?: PostgresJsDatabase<typeof schema>,
): Promise<string> {
  if (database) {
    const row = await database
      .select({ contentMd: prompts.contentMd })
      .from(prompts)
      .where(and(eq(prompts.slug, slug), eq(prompts.level, level)))
      .limit(1)

    if (row[0]?.contentMd) {
      return row[0].contentMd.trim()
    }
  }

  const filePath = join(PROMPTS_DIR, level, `${slug}.md`)
  const content = await readFile(filePath, 'utf-8')
  return content.trim()
}
