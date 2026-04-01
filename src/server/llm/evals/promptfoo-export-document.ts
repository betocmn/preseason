import { buildBenchmarkPrompt } from '~/server/llm/benchmark/prompt-builder'
import type { PromptLevel } from '~/server/llm/prompts'

export type PromptfooPromptRow = {
  id: string
  title: string
  slug: string
  level: PromptLevel
  contentMd: string | null
  expectedCategories: string[] | null
  isActive: boolean
}

export type PromptfooPromptExport = {
  id: string
  title: string
  slug: string
  level: PromptfooPromptRow['level']
  isActive: boolean
  expectedCategories: string[]
  rawPrompt: string
  benchmarkPrompt: string
}

export type PromptfooExportDocument = {
  generatedAt: string
  promptCount: number
  prompts: PromptfooPromptExport[]
}

export function toPromptfooPromptExport(prompt: PromptfooPromptRow): PromptfooPromptExport {
  const rawPrompt = prompt.contentMd?.trim()
  if (!rawPrompt) {
    throw new Error(`Prompt ${prompt.slug} (${prompt.level}) is missing content_md`)
  }

  const expectedCategories =
    prompt.expectedCategories?.filter((value) => value.trim().length > 0) ?? []
  if (expectedCategories.length === 0) {
    throw new Error(`Prompt ${prompt.slug} (${prompt.level}) is missing expected_categories`)
  }

  return {
    id: prompt.id,
    title: prompt.title,
    slug: prompt.slug,
    level: prompt.level,
    isActive: prompt.isActive,
    expectedCategories,
    rawPrompt,
    benchmarkPrompt: buildBenchmarkPrompt(rawPrompt, expectedCategories),
  }
}

export function buildPromptfooExportDocument(
  promptRows: PromptfooPromptRow[],
  generatedAt = new Date().toISOString(),
): PromptfooExportDocument {
  const exportedPrompts = [...promptRows]
    .sort((a, b) => {
      const byTitle = a.title.localeCompare(b.title)
      if (byTitle !== 0) return byTitle

      const bySlug = a.slug.localeCompare(b.slug)
      if (bySlug !== 0) return bySlug

      return a.level.localeCompare(b.level)
    })
    .map(toPromptfooPromptExport)

  return {
    generatedAt,
    promptCount: exportedPrompts.length,
    prompts: exportedPrompts,
  }
}
