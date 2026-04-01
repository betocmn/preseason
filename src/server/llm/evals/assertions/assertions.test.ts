import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import vm from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'

const nodeRequire = createRequire(import.meta.url)

function loadCommonJsModule(modulePath: string, cache = new Map<string, unknown>()) {
  const resolvedPath = resolve(modulePath)
  const cached = cache.get(resolvedPath)
  if (cached !== undefined) {
    return cached
  }

  const source = readFileSync(resolvedPath, 'utf8')
  const module = { exports: {} as unknown }
  cache.set(resolvedPath, module.exports)

  const localRequire = (specifier: string) => {
    if (specifier.startsWith('.')) {
      const nextPath = resolve(dirname(resolvedPath), specifier)
      const normalizedPath = nextPath.endsWith('.js') ? nextPath : `${nextPath}.js`
      return loadCommonJsModule(normalizedPath, cache)
    }

    return nodeRequire(specifier)
  }

  const wrapper = `(function (module, exports, require, __dirname, __filename) { ${source}\n})`
  const compiled = vm.runInThisContext(wrapper, { filename: resolvedPath }) as (
    module: { exports: unknown },
    exports: unknown,
    require: (specifier: string) => unknown,
    __dirname: string,
    __filename: string,
  ) => void

  compiled(module, module.exports, localRequire, dirname(resolvedPath), resolvedPath)
  cache.set(resolvedPath, module.exports)
  return module.exports
}

const benchmarkAppendixAssertion = loadCommonJsModule(
  resolve('src/server/llm/evals/assertions/benchmark-appendix.js'),
) as (
  output: string,
  context: { vars: { expected_categories: string } },
) => { pass: boolean; reason: string }
const majorToolSignalAssertion = loadCommonJsModule(
  resolve('src/server/llm/evals/assertions/major-tool-signal.js'),
) as (
  output: string,
  context: { vars: { tool_catalog_path: string } },
) => { pass: boolean; reason: string }

function wrapInTags(json: string) {
  return `Answer\n\n<preseason_benchmark_json>\n${json}\n</preseason_benchmark_json>`
}

function buildAppendixJson(reasoning: string) {
  return JSON.stringify({
    schema_version: 'benchmark-v1',
    categories: [
      {
        category_slug: 'auth',
        decision: 'tool',
        tool: 'Clerk',
        reasoning,
        confidence: 0.8,
      },
      {
        category_slug: 'database',
        decision: 'none',
        reasoning: 'No database tool needed',
        confidence: 0.9,
      },
    ],
  })
}

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('eval assertions', () => {
  it('benchmark appendix assertion accepts literal appendix tags inside JSON strings', () => {
    const output = wrapInTags(
      buildAppendixJson(
        'Mention <preseason_benchmark_json> and </preseason_benchmark_json> literally in rationale',
      ),
    )

    const result = benchmarkAppendixAssertion(output, {
      vars: { expected_categories: JSON.stringify(['auth', 'database']) },
    })

    expect(result.pass).toBe(true)
  })

  it('major tool signal assertion accepts literal appendix tags inside JSON strings', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'major-tool-signal-'))
    tempDirs.push(tempDir)

    const catalogPath = join(tempDir, 'catalog.json')
    await writeFile(
      catalogPath,
      `${JSON.stringify({
        knownNormalizedTerms: ['clerk'],
        knownFingerprints: ['clerk'],
        knownBrandTokens: ['clerk'],
        blockedExactPhrases: [],
        blockedSingleTokens: [],
        blockedTokens: [],
        genericVocabulary: [],
      })}\n`,
      'utf8',
    )

    const output = wrapInTags(
      buildAppendixJson(
        'Mention <preseason_benchmark_json> and </preseason_benchmark_json> literally in rationale',
      ),
    )

    const result = majorToolSignalAssertion(output, {
      vars: { tool_catalog_path: catalogPath },
    })

    expect(result.pass).toBe(true)
  })
})
