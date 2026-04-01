import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { PROMPT_CORPUS } from '~/server/db/prompt-corpus'
import { TOOLS } from '~/server/db/seed'
import type { PromptLevel } from '~/server/llm/prompts'
import {
  buildPromptfooExportDocument,
  exportPromptfooPrompts,
  type PromptfooPromptExport,
} from './export-promptfoo'

export const MAJOR_TOOL_EVAL_PROMPT_SELECTIONS = [
  { slug: 'saas-application', level: 'intermediate' },
  { slug: 'real-estate-website', level: 'intermediate' },
  { slug: 'blog-platform-cms', level: 'advanced' },
] as const satisfies ReadonlyArray<{
  slug: string
  level: PromptLevel
}>

export const MAJOR_TOOL_EVAL_PROVIDER_IDS = [
  'openrouter:openai/gpt-5.4-mini',
  'openrouter:anthropic/claude-haiku-4.5',
  'openrouter:google/gemini-2.5-flash',
] as const

const BLOCKED_EXACT_PHRASES = [
  'custom editorial application',
  'docs ui styling stack',
  'headless cms',
  'job hosting',
  'managed search service',
  'object storage',
  'orm',
  'paas',
  'search indexing',
  'transactional email',
  'utility-first styling system',
  'utility first styling system',
]

const BLOCKED_SINGLE_TOKENS = ['edition', 'git', 'orm', 'paas', 'plugin', 'theme']
const BLOCKED_TOKENS = [
  'boilerplate',
  'custom',
  'internal',
  'plugin',
  'starter',
  'template',
  'theme',
]
const GENERIC_VOCABULARY = [
  'application',
  'auth',
  'builder',
  'cms',
  'custom',
  'database',
  'docs',
  'editorial',
  'email',
  'headless',
  'hosting',
  'job',
  'managed',
  'object',
  'orm',
  'platform',
  'search',
  'service',
  'stack',
  'storage',
  'styling',
  'system',
  'transactional',
  'ui',
  'utility',
]

type EvalTestCase = {
  description: string
  metadata: Record<string, string>
  threshold: number
  vars: {
    expected_categories: string
    prompt_level: PromptLevel
    prompt_slug: string
    prompt_text: string
    tool_catalog_path: string
  }
  assert: Array<Record<string, unknown>>
}

function normalizeToolText(value: string): string {
  return value.toLowerCase().trim()
}

function fingerprintToolText(value: string): string {
  return normalizeToolText(value)
    .replace(/^https?:\/\//u, '')
    .replace(/^www\./u, '')
    .replace(/[/?#].*$/u, '')
    .replace(/\([^)]*\)/gu, ' ')
    .replace(/[+/_-]+/gu, ' ')
    .replace(/\./gu, ' ')
    .replace(/&/gu, ' and ')
    .replace(/[^a-z0-9\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function buildPromptCorpusExports(): PromptfooPromptExport[] {
  return buildPromptfooExportDocument(
    PROMPT_CORPUS.map((prompt) => ({
      id: `${prompt.slug}:${prompt.level}`,
      title: prompt.title,
      slug: prompt.slug,
      level: prompt.level,
      contentMd: prompt.contentMd,
      expectedCategories: prompt.expectedCategories,
      isActive: prompt.isActive,
    })),
  ).prompts
}

async function loadPromptExports(): Promise<{
  prompts: PromptfooPromptExport[]
  source: 'database' | 'prompt-corpus-fallback'
  warning: string | null
}> {
  try {
    const document = await exportPromptfooPrompts({ activeOnly: true })
    return {
      prompts: document.prompts,
      source: 'database',
      warning: null,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      prompts: buildPromptCorpusExports(),
      source: 'prompt-corpus-fallback',
      warning: `Fell back to prompt corpus export: ${message}`,
    }
  }
}

export function selectMajorToolEvalPrompts(
  prompts: PromptfooPromptExport[],
): PromptfooPromptExport[] {
  return MAJOR_TOOL_EVAL_PROMPT_SELECTIONS.map(({ slug, level }) => {
    const prompt = prompts.find((candidate) => candidate.slug === slug && candidate.level === level)
    if (!prompt) {
      throw new Error(`Missing selected eval prompt: ${slug}/${level}`)
    }

    return prompt
  })
}

export function buildMajorToolCatalog() {
  const knownTerms = new Set<string>()
  const knownFingerprints = new Set<string>()
  const knownBrandTokens = new Set<string>()

  for (const tool of TOOLS) {
    for (const term of [tool.name, tool.slug, ...(tool.aliases ?? [])]) {
      const normalized = normalizeToolText(term)
      const fingerprint = fingerprintToolText(term)
      if (normalized.length === 0 || fingerprint.length === 0) {
        continue
      }

      knownTerms.add(normalized)
      knownFingerprints.add(fingerprint)

      for (const token of fingerprint.split(' ')) {
        if (token.length >= 4 && !GENERIC_VOCABULARY.includes(token)) {
          knownBrandTokens.add(token)
        }
      }
    }
  }

  return {
    knownNormalizedTerms: [...knownTerms].sort(),
    knownFingerprints: [...knownFingerprints].sort(),
    knownBrandTokens: [...knownBrandTokens].sort(),
    blockedExactPhrases: [...BLOCKED_EXACT_PHRASES].sort(),
    blockedSingleTokens: [...BLOCKED_SINGLE_TOKENS].sort(),
    blockedTokens: [...BLOCKED_TOKENS].sort(),
    genericVocabulary: [...GENERIC_VOCABULARY].sort(),
  }
}

export function buildMajorToolEvalTests(
  prompts: PromptfooPromptExport[],
  repoRoot: string,
  toolCatalogPath: string,
): EvalTestCase[] {
  const appendixAssertionPath = pathToFileURL(
    path.join(repoRoot, 'src/server/llm/evals/assertions/benchmark-appendix.js'),
  ).toString()
  const majorToolAssertionPath = pathToFileURL(
    path.join(repoRoot, 'src/server/llm/evals/assertions/major-tool-signal.js'),
  ).toString()

  return prompts.map((prompt) => ({
    description: `${prompt.slug}/${prompt.level}`,
    metadata: {
      promptSlug: prompt.slug,
      promptLevel: prompt.level,
    },
    threshold: 1,
    vars: {
      expected_categories: JSON.stringify(prompt.expectedCategories),
      prompt_level: prompt.level,
      prompt_slug: prompt.slug,
      prompt_text: prompt.benchmarkPrompt,
      tool_catalog_path: toolCatalogPath,
    },
    assert: [
      {
        type: 'contains',
        value: '<preseason_benchmark_json>',
      },
      {
        type: 'contains',
        value: '</preseason_benchmark_json>',
      },
      {
        type: 'javascript',
        value: appendixAssertionPath,
      },
      {
        type: 'javascript',
        value: majorToolAssertionPath,
      },
    ],
  }))
}

async function writeJsonFile(outputPath: string, value: unknown): Promise<void> {
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function writeMajorToolEvalFixtures(repoRoot = process.cwd()) {
  const outputDir = path.join(repoRoot, '.context/promptfoo')
  const testsPath = path.join(outputDir, 'major-tool-tests.json')
  const promptsPath = path.join(outputDir, 'major-tool-prompts.json')
  const catalogPath = path.join(outputDir, 'major-tool-tool-catalog.json')
  const manifestPath = path.join(outputDir, 'major-tool-manifest.json')
  const loaded = await loadPromptExports()
  const selectedPrompts = selectMajorToolEvalPrompts(loaded.prompts)
  const toolCatalog = buildMajorToolCatalog()
  const tests = buildMajorToolEvalTests(selectedPrompts, repoRoot, catalogPath)

  await mkdir(outputDir, { recursive: true })
  await writeJsonFile(promptsPath, selectedPrompts)
  await writeJsonFile(catalogPath, toolCatalog)
  await writeJsonFile(testsPath, tests)
  await writeJsonFile(manifestPath, {
    generatedAt: new Date().toISOString(),
    promptSource: loaded.source,
    promptWarning: loaded.warning,
    selectedPrompts: selectedPrompts.map((prompt) => ({
      slug: prompt.slug,
      level: prompt.level,
      expectedCategories: prompt.expectedCategories,
    })),
    providerIds: MAJOR_TOOL_EVAL_PROVIDER_IDS,
    testsPath,
    promptsPath,
    toolCatalogPath: catalogPath,
  })

  process.stdout.write(`Wrote major tool eval fixtures to ${outputDir}\n`)
  if (loaded.warning) {
    process.stdout.write(`${loaded.warning}\n`)
  }

  return {
    outputDir,
    testsPath,
    promptsPath,
    catalogPath,
    manifestPath,
    promptSource: loaded.source,
    warning: loaded.warning,
  }
}

async function main() {
  await writeMajorToolEvalFixtures()
}

const entrypointPath = process.argv[1] ? path.resolve(process.argv[1]) : null

if (entrypointPath && fileURLToPath(import.meta.url) === entrypointPath) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown error'
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
