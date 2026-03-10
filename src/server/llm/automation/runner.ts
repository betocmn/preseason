import { eq, inArray } from 'drizzle-orm'
import { db } from '~/server/db'
import { llms, prompts, recommendations, runResults, runs, subcategories } from '~/server/db/schema'
import { parseRecommendations } from '~/server/llm/automation/parser'
import { getPromptContent, isPromptLevel, type PromptLevel } from '~/server/llm/prompts'
import { LlmService } from '~/server/llm/service'
import {
  buildExtractionSystemPrompt,
  buildGenerationSystemPrompt,
} from '~/server/llm/service/system-prompt'

type DatabaseClient = typeof db

type RunStatus = 'completed' | 'failed'

export type RunAutomationSummary = {
  runId: string
  status: RunStatus
  totalPairs: number
  succeededPairs: number
  failedPairs: number
  recommendationCount: number
  errors: string[]
}

export type RunAutomationOptions = {
  database?: DatabaseClient
  llmService?: LlmService
  now?: () => Date
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown error'
}

function resolvePromptLevel(level: string): PromptLevel {
  return isPromptLevel(level) ? level : 'vibe-coder'
}

function buildExtractionUserPrompt(userPrompt: string, assistantResponse: string) {
  return [
    'Project request:',
    userPrompt,
    '',
    'Assistant response:',
    assistantResponse,
    '',
    'Extract recommendations into JSON only.',
  ].join('\n')
}

async function upsertRunResult(
  database: DatabaseClient,
  values: {
    runId: string
    promptId: string
    llmId: string
    rawResponse: string
    parseStatus: 'pending' | 'success' | 'failed'
    responseTimeMs: number | null
  },
) {
  const result = await database
    .insert(runResults)
    .values(values)
    .onConflictDoUpdate({
      target: [runResults.runId, runResults.promptId, runResults.llmId],
      set: {
        rawResponse: values.rawResponse,
        parseStatus: values.parseStatus,
        responseTimeMs: values.responseTimeMs,
      },
    })
    .returning({ id: runResults.id })

  const runResult = result[0]
  if (!runResult) {
    throw new Error('Failed to persist run result')
  }

  return runResult
}

async function updateRunCompletion(
  database: DatabaseClient,
  runId: string,
  status: RunStatus,
  completedAt: Date,
  errors: string[],
) {
  await database
    .update(runs)
    .set({
      status,
      completedAt,
      errorLog: errors.length > 0 ? errors.join('\n') : null,
    })
    .where(eq(runs.id, runId))
}

export async function runAutomation(
  runId: string,
  options: RunAutomationOptions = {},
): Promise<RunAutomationSummary> {
  const database = options.database ?? db
  const llmService = options.llmService ?? new LlmService()
  const now = options.now ?? (() => new Date())

  const run = await database.query.runs.findFirst({
    where: eq(runs.id, runId),
  })

  if (!run) {
    throw new Error(`Run not found: ${runId}`)
  }

  const startedAt = now()
  await database
    .update(runs)
    .set({
      status: 'running',
      startedAt,
    })
    .where(eq(runs.id, run.id))

  const promptIds = run.promptIds ?? []
  const llmIds = run.llmIds ?? []

  let succeededPairs = 0
  let failedPairs = 0
  let recommendationCount = 0
  const errors: string[] = []

  if (promptIds.length === 0 || llmIds.length === 0) {
    const message = 'Run has no prompts or llms configured'
    errors.push(message)

    const completedAt = now()
    await updateRunCompletion(database, run.id, 'failed', completedAt, errors)

    return {
      runId: run.id,
      status: 'failed',
      totalPairs: 0,
      succeededPairs,
      failedPairs,
      recommendationCount,
      errors,
    }
  }

  try {
    const [selectedPrompts, selectedLlms, categoryRows] = await Promise.all([
      database
        .select({ id: prompts.id, slug: prompts.slug, level: prompts.level })
        .from(prompts)
        .where(inArray(prompts.id, promptIds)),
      database
        .select({ id: llms.id, slug: llms.slug, provider: llms.provider, modelId: llms.modelId })
        .from(llms)
        .where(inArray(llms.id, llmIds)),
      database.select({ slug: subcategories.slug }).from(subcategories),
    ])

    const totalPairs = selectedPrompts.length * selectedLlms.length

    const extractionSystemPrompt = buildExtractionSystemPrompt(
      categoryRows.map((category) => category.slug),
    )

    for (const prompt of selectedPrompts) {
      let userPrompt: string | null = null

      try {
        userPrompt = await getPromptContent(prompt.slug, resolvePromptLevel(prompt.level), database)
      } catch (error) {
        const message = getErrorMessage(error)

        for (const llm of selectedLlms) {
          failedPairs += 1
          errors.push(`[${prompt.slug} x ${llm.slug}] Prompt load failed: ${message}`)

          await upsertRunResult(database, {
            runId: run.id,
            promptId: prompt.id,
            llmId: llm.id,
            rawResponse: `PROMPT_LOAD_ERROR: ${message}`,
            parseStatus: 'failed',
            responseTimeMs: null,
          })
        }

        continue
      }

      const generationSystemPrompt = buildGenerationSystemPrompt(resolvePromptLevel(prompt.level))

      for (const llm of selectedLlms) {
        const pairStartedAt = Date.now()

        try {
          const primaryCompletion = await llmService.complete(llm.provider, {
            model: llm.modelId,
            systemPrompt: generationSystemPrompt,
            userPrompt,
          })

          let rawResponse = primaryCompletion.content
          let responseTimeMs = primaryCompletion.latencyMs
          let parsedRecommendations = await parseRecommendations(primaryCompletion.content, {
            database,
          })

          if (parsedRecommendations.length === 0) {
            try {
              const extractionCompletion = await llmService.complete(llm.provider, {
                model: llm.modelId,
                systemPrompt: extractionSystemPrompt,
                userPrompt: buildExtractionUserPrompt(userPrompt, primaryCompletion.content),
              })

              parsedRecommendations = await parseRecommendations(extractionCompletion.content, {
                database,
              })
              responseTimeMs += extractionCompletion.latencyMs
              rawResponse = [
                primaryCompletion.content,
                '',
                '--- FALLBACK_EXTRACTION_RESPONSE ---',
                extractionCompletion.content,
              ].join('\n')
            } catch (error) {
              const message = getErrorMessage(error)
              throw new Error(`Fallback extraction failed: ${message}`)
            }
          }

          const runResult = await upsertRunResult(database, {
            runId: run.id,
            promptId: prompt.id,
            llmId: llm.id,
            rawResponse,
            parseStatus: 'pending',
            responseTimeMs,
          })

          await database
            .delete(recommendations)
            .where(eq(recommendations.runResultId, runResult.id))

          if (parsedRecommendations.length > 0) {
            await database.insert(recommendations).values(
              parsedRecommendations.map((recommendation) => ({
                runResultId: runResult.id,
                toolId: recommendation.toolId,
                categoryId: recommendation.categoryId,
                confidence: recommendation.confidence,
                reasoning: recommendation.reasoning,
                rank: recommendation.rank,
              })),
            )
          }

          await database
            .update(runResults)
            .set({ parseStatus: 'success' })
            .where(eq(runResults.id, runResult.id))

          succeededPairs += 1
          recommendationCount += parsedRecommendations.length
        } catch (error) {
          failedPairs += 1
          const message = getErrorMessage(error)
          errors.push(`[${prompt.slug} x ${llm.slug}] ${message}`)

          await upsertRunResult(database, {
            runId: run.id,
            promptId: prompt.id,
            llmId: llm.id,
            rawResponse: `RUN_PAIR_ERROR: ${message}`,
            parseStatus: 'failed',
            responseTimeMs: Date.now() - pairStartedAt,
          })
        }
      }
    }

    const completedAt = now()
    const status: RunStatus = succeededPairs > 0 ? 'completed' : 'failed'

    await updateRunCompletion(database, run.id, status, completedAt, errors)

    return {
      runId: run.id,
      status,
      totalPairs,
      succeededPairs,
      failedPairs,
      recommendationCount,
      errors,
    }
  } catch (error) {
    const message = getErrorMessage(error)
    const allErrors = [`Run orchestration failed: ${message}`, ...errors]
    const completedAt = now()

    await updateRunCompletion(database, run.id, 'failed', completedAt, allErrors)

    throw error
  }
}
