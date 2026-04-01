import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { asc, eq } from 'drizzle-orm'
import { db } from '~/server/db'
import { prompts } from '~/server/db/schema'
import {
  buildPromptfooExportDocument,
  type PromptfooExportDocument,
  type PromptfooPromptRow,
  toPromptfooPromptExport,
} from './promptfoo-export-document'

type CliOptions = {
  activeOnly: boolean
  outputPath?: string
}

type PromptRow = Pick<
  typeof prompts.$inferSelect,
  'id' | 'title' | 'slug' | 'level' | 'contentMd' | 'expectedCategories' | 'isActive'
>

export { buildPromptfooExportDocument, toPromptfooPromptExport }
export type { PromptfooExportDocument, PromptfooPromptExport } from './promptfoo-export-document'

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { activeOnly: true }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--') {
      continue
    }

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
  const promptRows: PromptfooPromptRow[] = await loadPrompts(options.activeOnly)
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
