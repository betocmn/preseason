import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { asc, eq } from 'drizzle-orm'
import { db } from '~/server/db'
import { prompts } from '~/server/db/schema'
import { buildBenchmarkPrompt } from '~/server/llm/benchmark/prompt-builder'

type PromptRow = Pick<
  typeof prompts.$inferSelect,
  'id' | 'title' | 'slug' | 'level' | 'contentMd' | 'expectedCategories' | 'isActive'
>

export type PromptfooPromptExport = {
  id: string
  title: string
  slug: string
  level: PromptRow['level']
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

type CliOptions = {
  activeOnly: boolean
  outputPath?: string
}

export function toPromptfooPromptExport(prompt: PromptRow): PromptfooPromptExport {
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
  promptRows: PromptRow[],
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

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { activeOnly: true }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--all') {
      options.activeOnly = false
      continue
    }

    if (arg === '--output') {
      const next = argv[index + 1]
      if (!next) {
        throw new Error('Missing value for --output')
      }
      options.outputPath = next
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

async function loadPrompts(activeOnly: boolean): Promise<PromptRow[]> {
  const query = db
    .select({
      id: prompts.id,
      title: prompts.title,
      slug: prompts.slug,
      level: prompts.level,
      contentMd: prompts.contentMd,
      expectedCategories: prompts.expectedCategories,
      isActive: prompts.isActive,
    })
    .from(prompts)
    .orderBy(asc(prompts.title), asc(prompts.slug), asc(prompts.level))

  return activeOnly ? query.where(eq(prompts.isActive, true)) : query
}

export async function exportPromptfooPrompts(
  options: CliOptions,
): Promise<PromptfooExportDocument> {
  const promptRows = await loadPrompts(options.activeOnly)
  return buildPromptfooExportDocument(promptRows)
}

async function writeOutput(document: PromptfooExportDocument, outputPath?: string) {
  const payload = `${JSON.stringify(document, null, 2)}\n`

  if (!outputPath) {
    process.stdout.write(payload)
    return
  }

  const resolvedPath = path.resolve(outputPath)
  await mkdir(path.dirname(resolvedPath), { recursive: true })
  await writeFile(resolvedPath, payload, 'utf8')
  process.stdout.write(`Exported ${document.promptCount} prompts to ${resolvedPath}\n`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const document = await exportPromptfooPrompts(options)
  await writeOutput(document, options.outputPath)
}

const entrypointPath = process.argv[1] ? path.resolve(process.argv[1]) : null

if (entrypointPath && fileURLToPath(import.meta.url) === entrypointPath) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown error'
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
