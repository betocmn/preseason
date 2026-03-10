import { and, count, countDistinct, eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { db as defaultDb } from '~/server/db'
import type * as schema from '~/server/db/schema'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkModelWeightConfigs,
  benchmarkRuns,
  subcategories,
} from '~/server/db/schema'
import { checkModelDrift } from '~/server/llm/benchmark/model-drift'
import { PARSER_VERSION, parseBenchmarkResponse } from '~/server/llm/benchmark/parser'
import { buildBenchmarkPrompt } from '~/server/llm/benchmark/prompt-builder'
import { evaluateQc, type QcCheckResult } from '~/server/llm/benchmark/qc'
import {
  buildToolResolutionIndex,
  resolveToolWithCandidateQueue,
} from '~/server/llm/benchmark/tool-resolver'
import { LlmService } from '~/server/llm/service'
import { buildGenerationSystemPrompt } from '~/server/llm/service/system-prompt'

type DatabaseClient = PostgresJsDatabase<typeof schema>

export type BenchmarkRunOptions = {
  database?: DatabaseClient
  llmService?: LlmService
  now?: () => Date
}

export type BenchmarkRunSummary = {
  runId: string
  seasonId: string
  status: 'completed' | 'failed' | 'qc_failed'
  totalCases: number
  completedCases: number
  failedCases: number
  invalidOutputCases: number
  unresolvedToolCount: number
  qc: QcCheckResult
  errors: string[]
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error'
}

async function createOrLoadRun(database: DatabaseClient, seasonId: string, scheduledFor: string) {
  const [inserted] = await database
    .insert(benchmarkRuns)
    .values({ seasonId, scheduledFor, trigger: 'cron', status: 'pending' })
    .onConflictDoNothing()
    .returning()

  if (inserted) return inserted

  const existing = await database.query.benchmarkRuns.findFirst({
    where: and(eq(benchmarkRuns.seasonId, seasonId), eq(benchmarkRuns.scheduledFor, scheduledFor)),
  })

  if (!existing) throw new Error('Failed to create or load benchmark run')
  return existing
}

export async function runBenchmark(
  seasonId: string,
  scheduledFor: string,
  options: BenchmarkRunOptions = {},
): Promise<BenchmarkRunSummary> {
  const database = options.database ?? (defaultDb as unknown as DatabaseClient)
  const llmService = options.llmService ?? new LlmService()
  const now = options.now ?? (() => new Date())

  const run = await createOrLoadRun(database, seasonId, scheduledFor)

  if (run.status === 'published' || run.status === 'completed') {
    const qc = evaluateQc({
      totalCases: run.expectedCaseCount ?? 0,
      completedCases: run.completedCaseCount ?? 0,
      failedCases: run.failedCaseCount ?? 0,
      invalidOutputCases: 0,
      unresolvedToolDecisions: 0,
      totalToolDecisions: 0,
      distinctModelSnapshots: 0,
      distinctPromptVersions: 0,
    })
    return {
      runId: run.id,
      seasonId,
      status: run.status === 'published' ? 'completed' : run.status,
      totalCases: run.expectedCaseCount ?? 0,
      completedCases: run.completedCaseCount ?? 0,
      failedCases: run.failedCaseCount ?? 0,
      invalidOutputCases: 0,
      unresolvedToolCount: 0,
      qc,
      errors: [],
    }
  }

  await database
    .update(benchmarkRuns)
    .set({ status: 'running', startedAt: now() })
    .where(eq(benchmarkRuns.id, run.id))

  const weightConfig = await database.query.benchmarkModelWeightConfigs.findFirst({
    where: eq(benchmarkModelWeightConfigs.isActive, true),
  })

  if (weightConfig) {
    await database
      .update(benchmarkRuns)
      .set({ weightConfigId: weightConfig.id })
      .where(eq(benchmarkRuns.id, run.id))
  }

  const allCases = await database.query.benchmarkCases.findMany({
    where: and(eq(benchmarkCases.seasonId, seasonId), eq(benchmarkCases.isActive, true)),
    with: {
      promptVersion: { with: { categories: true } },
      modelSnapshot: true,
    },
  })

  await database
    .update(benchmarkRuns)
    .set({ expectedCaseCount: allCases.length })
    .where(eq(benchmarkRuns.id, run.id))

  if (allCases.length === 0) {
    const qc = evaluateQc({
      totalCases: 0,
      completedCases: 0,
      failedCases: 0,
      invalidOutputCases: 0,
      unresolvedToolDecisions: 0,
      totalToolDecisions: 0,
      distinctModelSnapshots: 0,
      distinctPromptVersions: 0,
    })

    await database
      .update(benchmarkRuns)
      .set({
        status: 'qc_failed',
        completedAt: now(),
        completedCaseCount: 0,
        failedCaseCount: 0,
        qcStatus: 'failed',
        qcSummaryJson: qc,
      })
      .where(eq(benchmarkRuns.id, run.id))

    return {
      runId: run.id,
      seasonId,
      status: 'qc_failed',
      totalCases: 0,
      completedCases: 0,
      failedCases: 0,
      invalidOutputCases: 0,
      unresolvedToolCount: 0,
      qc,
      errors: [],
    }
  }

  const allSubcategories = await database
    .select({ id: subcategories.id, slug: subcategories.slug })
    .from(subcategories)

  const categorySlugById = new Map(allSubcategories.map((s) => [s.id, s.slug]))

  const existingResults = await database
    .select({ caseId: benchmarkCaseResults.caseId })
    .from(benchmarkCaseResults)
    .where(eq(benchmarkCaseResults.runId, run.id))

  const completedCaseIds = new Set(existingResults.map((r) => r.caseId))
  const pendingCases = allCases.filter((c) => !completedCaseIds.has(c.id))

  const toolIndex = await buildToolResolutionIndex(database)

  const errors: string[] = []

  for (const benchmarkCase of pendingCases) {
    try {
      const { promptVersion, modelSnapshot } = benchmarkCase

      const eligibleCategorySlugs = promptVersion.categories
        .map((c) => categorySlugById.get(c.categoryId))
        .filter((slug): slug is string => slug !== undefined)

      if (eligibleCategorySlugs.length === 0) {
        throw new Error('No eligible category slugs found for prompt version')
      }

      const userPrompt = buildBenchmarkPrompt(promptVersion.contentMd ?? '', eligibleCategorySlugs)
      const systemPrompt =
        promptVersion.systemPromptSnapshot ??
        buildGenerationSystemPrompt(
          promptVersion.level as
            | 'vibe-coder'
            | 'software-dev-beginner'
            | 'software-dev-experienced',
        )

      const completion = await llmService.complete(modelSnapshot.provider, {
        model: modelSnapshot.requestedModelId,
        systemPrompt,
        userPrompt,
        temperature: modelSnapshot.temperature ?? undefined,
        topP: modelSnapshot.topP ?? undefined,
        maxTokens: modelSnapshot.maxTokens ?? undefined,
        seed: modelSnapshot.seed ?? undefined,
      })

      const drift = checkModelDrift(modelSnapshot.requestedModelId, completion.returnedModel)

      if (drift.hasDrift) {
        const [result] = await database
          .insert(benchmarkCaseResults)
          .values({
            seasonId,
            runId: run.id,
            caseId: benchmarkCase.id,
            status: 'invalid_output',
            rawResponse: completion.content,
            requestedModelId: modelSnapshot.requestedModelId,
            returnedModelId: completion.returnedModel,
            provider: completion.provider,
            finishReason: completion.finishReason,
            promptTokens: completion.usage.promptTokens,
            completionTokens: completion.usage.completionTokens,
            totalTokens: completion.usage.totalTokens,
            latencyMs: completion.latencyMs,
            temperature: modelSnapshot.temperature,
            topP: modelSnapshot.topP,
            maxTokens: modelSnapshot.maxTokens,
            parserVersion: PARSER_VERSION,
            systemPromptSnapshot: systemPrompt,
            errorMessage: `Model drift detected: requested ${drift.requestedModel}, got ${drift.returnedModel}`,
          })
          .onConflictDoNothing()
          .returning()

        if (!result) continue
        errors.push(
          `[case ${benchmarkCase.id}] Model drift: ${drift.requestedModel} → ${drift.returnedModel}`,
        )
        continue
      }

      const parseResult = parseBenchmarkResponse(completion.content, eligibleCategorySlugs)

      const [caseResult] = await database
        .insert(benchmarkCaseResults)
        .values({
          seasonId,
          runId: run.id,
          caseId: benchmarkCase.id,
          status: parseResult.status === 'ok' ? 'completed' : 'invalid_output',
          naturalResponse: parseResult.status === 'ok' ? parseResult.naturalResponse : null,
          appendixRaw: parseResult.status === 'ok' ? parseResult.rawAppendix : null,
          appendixJson: parseResult.status === 'ok' ? parseResult.appendix : null,
          rawResponse: completion.content,
          requestedModelId: modelSnapshot.requestedModelId,
          returnedModelId: completion.returnedModel,
          provider: completion.provider,
          finishReason: completion.finishReason,
          promptTokens: completion.usage.promptTokens,
          completionTokens: completion.usage.completionTokens,
          totalTokens: completion.usage.totalTokens,
          latencyMs: completion.latencyMs,
          temperature: modelSnapshot.temperature,
          topP: modelSnapshot.topP,
          maxTokens: modelSnapshot.maxTokens,
          parserVersion: PARSER_VERSION,
          systemPromptSnapshot: systemPrompt,
          errorMessage: parseResult.status === 'invalid_output' ? parseResult.reason : null,
        })
        .onConflictDoNothing()
        .returning()

      if (!caseResult) continue

      if (parseResult.status === 'ok') {
        const categoryIdBySlug = new Map(
          promptVersion.categories.map((c) => [categorySlugById.get(c.categoryId), c.categoryId]),
        )

        for (const decision of parseResult.appendix.categories) {
          const categoryId = categoryIdBySlug.get(decision.category_slug)
          if (!categoryId) continue

          if (decision.decision === 'tool' && decision.tool) {
            const resolved = await resolveToolWithCandidateQueue(
              database,
              decision.tool,
              toolIndex,
              categoryId,
            )

            await database
              .insert(benchmarkCaseDecisions)
              .values({
                caseResultId: caseResult.id,
                categoryId,
                decisionType: 'tool',
                toolId: resolved.status === 'resolved' ? resolved.toolId : null,
                rawToolName: decision.tool,
                reasoning: decision.reasoning,
                selfReportedConfidence: decision.confidence,
                resolutionStatus: resolved.status === 'resolved' ? 'resolved' : 'unresolved_tool',
              })
              .onConflictDoNothing()
          } else {
            await database
              .insert(benchmarkCaseDecisions)
              .values({
                caseResultId: caseResult.id,
                categoryId,
                decisionType: 'none',
                toolId: null,
                rawToolName: null,
                reasoning: decision.reasoning,
                selfReportedConfidence: decision.confidence,
                resolutionStatus: 'resolved',
              })
              .onConflictDoNothing()
          }
        }
      } else {
        errors.push(`[case ${benchmarkCase.id}] Invalid output: ${parseResult.reason}`)
      }
    } catch (error) {
      const message = getErrorMessage(error)
      errors.push(`[case ${benchmarkCase.id}] ${message}`)

      await database
        .insert(benchmarkCaseResults)
        .values({
          seasonId,
          runId: run.id,
          caseId: benchmarkCase.id,
          status: 'failed',
          errorMessage: message,
          parserVersion: PARSER_VERSION,
        })
        .onConflictDoNothing()
    }
  }

  const statusCounts = await database
    .select({ status: benchmarkCaseResults.status, cnt: count() })
    .from(benchmarkCaseResults)
    .where(eq(benchmarkCaseResults.runId, run.id))
    .groupBy(benchmarkCaseResults.status)

  const countByStatus = new Map(statusCounts.map((r) => [r.status, Number(r.cnt)]))
  const completedCount = countByStatus.get('completed') ?? 0
  const failedCount = countByStatus.get('failed') ?? 0
  const invalidOutputCount = countByStatus.get('invalid_output') ?? 0

  const completedResultIds = await database
    .select({ id: benchmarkCaseResults.id })
    .from(benchmarkCaseResults)
    .where(
      and(eq(benchmarkCaseResults.runId, run.id), eq(benchmarkCaseResults.status, 'completed')),
    )

  const completedIds = completedResultIds.map((r) => r.id)

  let unresolvedCount = 0
  let totalToolDecisions = 0

  if (completedIds.length > 0) {
    const [unresolvedRow] = await database
      .select({ cnt: count() })
      .from(benchmarkCaseDecisions)
      .innerJoin(
        benchmarkCaseResults,
        eq(benchmarkCaseDecisions.caseResultId, benchmarkCaseResults.id),
      )
      .where(
        and(
          eq(benchmarkCaseResults.runId, run.id),
          eq(benchmarkCaseDecisions.resolutionStatus, 'unresolved_tool'),
        ),
      )

    unresolvedCount = Number(unresolvedRow?.cnt ?? 0)

    const [toolDecisionRow] = await database
      .select({ cnt: count() })
      .from(benchmarkCaseDecisions)
      .innerJoin(
        benchmarkCaseResults,
        eq(benchmarkCaseDecisions.caseResultId, benchmarkCaseResults.id),
      )
      .where(
        and(
          eq(benchmarkCaseResults.runId, run.id),
          eq(benchmarkCaseDecisions.decisionType, 'tool'),
        ),
      )

    totalToolDecisions = Number(toolDecisionRow?.cnt ?? 0)
  }

  const [distinctModelsRow] = await database
    .select({ cnt: countDistinct(benchmarkCases.modelSnapshotId) })
    .from(benchmarkCaseResults)
    .innerJoin(benchmarkCases, eq(benchmarkCaseResults.caseId, benchmarkCases.id))
    .where(
      and(eq(benchmarkCaseResults.runId, run.id), eq(benchmarkCaseResults.status, 'completed')),
    )

  const [distinctPromptsRow] = await database
    .select({ cnt: countDistinct(benchmarkCases.promptVersionId) })
    .from(benchmarkCaseResults)
    .innerJoin(benchmarkCases, eq(benchmarkCaseResults.caseId, benchmarkCases.id))
    .where(
      and(eq(benchmarkCaseResults.runId, run.id), eq(benchmarkCaseResults.status, 'completed')),
    )

  const distinctModelSnapshots = Number(distinctModelsRow?.cnt ?? 0)
  const distinctPromptVersions = Number(distinctPromptsRow?.cnt ?? 0)

  const qc = evaluateQc({
    totalCases: allCases.length,
    completedCases: completedCount,
    failedCases: failedCount,
    invalidOutputCases: invalidOutputCount,
    unresolvedToolDecisions: unresolvedCount,
    totalToolDecisions,
    distinctModelSnapshots,
    distinctPromptVersions,
  })

  const finalStatus = qc.passed ? 'completed' : 'qc_failed'

  await database
    .update(benchmarkRuns)
    .set({
      status: finalStatus,
      completedAt: now(),
      completedCaseCount: completedCount,
      failedCaseCount: failedCount + invalidOutputCount,
      qcStatus: qc.passed ? 'passed' : 'failed',
      qcSummaryJson: qc,
      errorLog: errors.length > 0 ? errors.join('\n') : null,
    })
    .where(eq(benchmarkRuns.id, run.id))

  return {
    runId: run.id,
    seasonId,
    status: finalStatus,
    totalCases: allCases.length,
    completedCases: completedCount,
    failedCases: failedCount,
    invalidOutputCases: invalidOutputCount,
    unresolvedToolCount: unresolvedCount,
    qc,
    errors,
  }
}
