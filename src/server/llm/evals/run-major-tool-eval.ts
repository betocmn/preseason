import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeMajorToolEvalFixtures } from './write-major-tool-eval-fixtures'

const PROMPTFOO_VERSION = '0.120.19'

type PromptfooRunMode = 'default' | 'broad'

type CliOptions = {
  mode: PromptfooRunMode
}

type PromptfooRunStats = {
  successes: number
  failures: number
  errors: number
}

type PromptfooComponentResult = {
  pass?: boolean
  reason?: string
}

type PromptfooResultRow = {
  success?: boolean
  provider?: { id?: string } | string
  vars?: {
    prompt_level?: string
    prompt_slug?: string
  }
  error?: string
  gradingResult?: {
    componentResults?: PromptfooComponentResult[]
  }
}

type PromptfooResultDocument = {
  results?: {
    results?: PromptfooResultRow[]
    stats?: PromptfooRunStats
  }
}

type PromptfooRunConfig = {
  configPath: string
  resultsPath: string
  htmlPath: string
}

export function parseArgs(argv: string[]): CliOptions {
  let mode: PromptfooRunMode = 'default'

  for (const arg of argv) {
    if (arg === '--broad') {
      mode = 'broad'
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return { mode }
}

export function buildPromptfooRunConfig(
  repoRoot: string,
  mode: PromptfooRunMode,
): PromptfooRunConfig {
  const isBroad = mode === 'broad'
  const resultsBasename = isBroad ? 'major-tool-broad-results' : 'major-tool-results'

  return {
    configPath: path.join(
      repoRoot,
      isBroad ? 'promptfooconfig.major-tools-broad.yaml' : 'promptfooconfig.major-tools.yaml',
    ),
    resultsPath: path.join(repoRoot, '.context/promptfoo', `${resultsBasename}.json`),
    htmlPath: path.join(repoRoot, '.context/promptfoo', `${resultsBasename}.html`),
  }
}

function loadPromptfooResultDocument(resultsPath: string): PromptfooResultDocument | null {
  if (!existsSync(resultsPath)) {
    return null
  }

  const raw = readFileSync(resultsPath, 'utf8')
  return JSON.parse(raw) as PromptfooResultDocument
}

function getProviderId(provider: PromptfooResultRow['provider']): string {
  if (typeof provider === 'string') {
    return provider
  }

  return provider?.id ?? 'unknown-provider'
}

export function extractPromptfooFailureSummaries(document: PromptfooResultDocument): string[] {
  return (document.results?.results ?? [])
    .filter((row) => row.success === false)
    .map((row) => {
      const providerId = getProviderId(row.provider)
      const promptSlug = row.vars?.prompt_slug ?? 'unknown-prompt'
      const promptLevel = row.vars?.prompt_level ?? 'unknown-level'
      const firstAssertionReason = row.gradingResult?.componentResults
        ?.find((component) => component.pass === false)
        ?.reason?.trim()

      return `${providerId} ${promptSlug}/${promptLevel}: ${firstAssertionReason ?? row.error ?? 'Unknown failure'}`
    })
}

export function resolvePromptfooExitCode(input: {
  mode: PromptfooRunMode
  promptfooExitCode: number
  stats: PromptfooRunStats | null
  hasResults: boolean
}): number {
  if (
    input.mode === 'broad' &&
    input.promptfooExitCode === 100 &&
    input.hasResults &&
    input.stats?.failures &&
    input.stats?.errors === 0
  ) {
    return 0
  }

  return input.promptfooExitCode
}

function printFailureSummary(mode: PromptfooRunMode, summaries: string[]) {
  if (summaries.length === 0) {
    return
  }

  process.stdout.write('\nPromptfoo failure summary:\n')
  for (const summary of summaries) {
    process.stdout.write(`- ${summary}\n`)
  }

  if (mode === 'broad') {
    process.stdout.write(
      '\nExploratory broad eval failures were recorded without failing the command.\n',
    )
  }
}

export async function runMajorToolEval(mode: PromptfooRunMode, repoRoot = process.cwd()) {
  await writeMajorToolEvalFixtures(repoRoot)

  const runConfig = buildPromptfooRunConfig(repoRoot, mode)
  rmSync(runConfig.resultsPath, { force: true })
  rmSync(runConfig.htmlPath, { force: true })
  const promptfooArgs = [
    `promptfoo@${PROMPTFOO_VERSION}`,
    'eval',
    '-c',
    runConfig.configPath,
    '-t',
    path.join(repoRoot, '.context/promptfoo/major-tool-tests.json'),
    '--env-path',
    path.join(repoRoot, '.env.local'),
    '-j',
    '1',
    '--no-share',
    '-o',
    runConfig.resultsPath,
    '-o',
    runConfig.htmlPath,
  ]
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const promptfooResult = spawnSync(npxCommand, promptfooArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  if (promptfooResult.error) {
    throw promptfooResult.error
  }

  const document = loadPromptfooResultDocument(runConfig.resultsPath)
  const summaries = document ? extractPromptfooFailureSummaries(document) : []
  printFailureSummary(mode, summaries)

  const exitCode = resolvePromptfooExitCode({
    mode,
    promptfooExitCode: promptfooResult.status ?? 1,
    stats: document?.results?.stats ?? null,
    hasResults: document !== null,
  })
  process.exitCode = exitCode
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  await runMajorToolEval(options.mode)
}

const entrypointPath = process.argv[1] ? path.resolve(process.argv[1]) : null

if (entrypointPath && fileURLToPath(import.meta.url) === entrypointPath) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : 'Unknown error'
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  })
}
