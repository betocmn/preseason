import { and, desc, eq, gt, isNull, or } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { z } from 'zod'
import { serverSettings } from '~/constants/server-settings'
import { loadToolSearchCatalog, buildToolReviewShortlist } from '~/server/api/helpers/tool-search'
import { db as defaultDb } from '~/server/db'
import type * as schema from '~/server/db/schema'
import { toolCandidates } from '~/server/db/schema'
import { LlmService } from '~/server/llm/service'

type DatabaseClient = PostgresJsDatabase<typeof schema>

const REVIEW_OPEN_TAG = '<preseason_tool_candidate_review_json>'
const REVIEW_CLOSE_TAG = '</preseason_tool_candidate_review_json>'
const REVIEW_SCHEMA_VERSION = 'tool-candidate-review-v1'

const reviewResponseSchema = z
  .object({
    schema_version: z.literal(REVIEW_SCHEMA_VERSION),
    decision: z.enum(['match', 'no_match']),
    tool_id: z.string().uuid().nullable(),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1).max(500),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'match' && !value.tool_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'tool_id is required when decision is "match"',
        path: ['tool_id'],
      })
    }

    if (value.decision === 'no_match' && value.tool_id !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'tool_id must be null when decision is "no_match"',
        path: ['tool_id'],
      })
    }
  })

type ToolCandidateReview = z.infer<typeof reviewResponseSchema>

export type ToolCandidateReviewSummary = {
  reviewedCount: number
  suggestedCount: number
  noMatchCount: number
  errorCount: number
}

export type ToolCandidateReviewerOptions = {
  database?: DatabaseClient
  llmService?: LlmService
  limit?: number
  now?: () => Date
}

function extractTaggedJson(rawContent: string): string | null {
  const openIndex = rawContent.lastIndexOf(REVIEW_OPEN_TAG)
  const closeIndex = rawContent.indexOf(REVIEW_CLOSE_TAG, openIndex + REVIEW_OPEN_TAG.length)

  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) {
    return null
  }

  return rawContent.slice(openIndex + REVIEW_OPEN_TAG.length, closeIndex).trim()
}

function parseToolCandidateReviewResponse(
  rawContent: string,
  allowedToolIds: Set<string>,
): ToolCandidateReview {
  const rawJson = extractTaggedJson(rawContent)
  if (!rawJson) {
    throw new Error(`Missing ${REVIEW_OPEN_TAG} tags`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error'
    throw new Error(`Malformed JSON: ${message}`)
  }

  const review = reviewResponseSchema.parse(parsed)
  if (review.tool_id && !allowedToolIds.has(review.tool_id)) {
    throw new Error('tool_id must refer to one of the shortlisted tools')
  }

  return review
}

function buildReviewSystemPrompt() {
  return [
    'You review unresolved third-party tool mentions against an existing canonical tool catalog.',
    `Return ONLY JSON inside ${REVIEW_OPEN_TAG} and ${REVIEW_CLOSE_TAG}.`,
    'Schema:',
    JSON.stringify(
      {
        schema_version: REVIEW_SCHEMA_VERSION,
        decision: 'match',
        tool_id: '00000000-0000-0000-0000-000000000000',
        confidence: 0.91,
        reason: 'Candidate is clearly a branded variant of the canonical tool.',
      },
      null,
      2,
    ),
    'Rules:',
    'Choose "match" only when the candidate and shortlisted tool clearly refer to the same underlying third-party product or brand.',
    'Allowed matches include domain variants, product-surface variants, and branded qualifiers like docs, ci, sdk, auth, cloud, labs, or messaging when they still refer to the same core tool.',
    'Choose "no_match" for ambiguous names, generic technology names, or cases where the modifier could indicate a separate product.',
    'tool_id must be null for "no_match" and must exactly match one shortlisted tool id for "match".',
  ].join('\n')
}

function buildReviewUserPrompt(
  candidate: {
    rawName: string
    normalizedName: string
    suggestedCategoryId: string | null
    suggestedCategory?: {
      slug: string
      name: string
    } | null
  },
  shortlist: Awaited<ReturnType<typeof buildToolReviewShortlist>>,
) {
  return [
    `Candidate raw name: ${JSON.stringify(candidate.rawName)}`,
    `Candidate normalized name: ${JSON.stringify(candidate.normalizedName)}`,
    `Suggested category: ${JSON.stringify(candidate.suggestedCategory?.slug ?? null)}`,
    'Shortlisted canonical tools:',
    JSON.stringify(
      shortlist.map((entry) => ({
        id: entry.tool.id,
        name: entry.tool.name,
        slug: entry.tool.slug,
        website: entry.tool.website,
        description: entry.tool.description,
        aliases: entry.tool.toolAliases.map((alias) => alias.alias),
        categories: entry.tool.toolCategories.map((category) => category.categoryId),
        similarity: Number(entry.similarity.toFixed(3)),
        matchType: entry.matchType,
      })),
      null,
      2,
    ),
  ].join('\n\n')
}

async function persistReviewResult(
  database: DatabaseClient,
  candidateId: string,
  payload: {
    reviewedAt: Date
    reviewModel: string | null
    suggestedToolId: string | null
    confidence: number | null
    reason: string | null
    error: string | null
  },
) {
  await database
    .update(toolCandidates)
    .set({
      aiSuggestedToolId: payload.suggestedToolId,
      aiReviewConfidence: payload.confidence,
      aiReviewReason: payload.reason,
      aiReviewError: payload.error,
      aiReviewModel: payload.reviewModel,
      aiReviewedAt: payload.reviewedAt,
    })
    .where(eq(toolCandidates.id, candidateId))
}

export async function reviewPendingToolCandidates(
  options: ToolCandidateReviewerOptions = {},
): Promise<ToolCandidateReviewSummary> {
  const database = options.database ?? defaultDb
  const llmService = options.llmService ?? new LlmService()
  const now = options.now ?? (() => new Date())
  const reviewTime = now()

  const pendingCandidates = await database.query.toolCandidates.findMany({
    where: and(
      eq(toolCandidates.status, 'pending'),
      or(
        isNull(toolCandidates.aiReviewedAt),
        gt(toolCandidates.lastSeenAt, toolCandidates.aiReviewedAt),
      ),
    ),
    orderBy: [desc(toolCandidates.seenCount), desc(toolCandidates.lastSeenAt)],
    limit: options.limit ?? serverSettings.toolCandidateReview.cronBatchSize,
    with: {
      suggestedCategory: {
        columns: {
          slug: true,
          name: true,
        },
      },
    },
  })

  if (pendingCandidates.length === 0) {
    return {
      reviewedCount: 0,
      suggestedCount: 0,
      noMatchCount: 0,
      errorCount: 0,
    }
  }

  const catalog = await loadToolSearchCatalog(database)
  const summary: ToolCandidateReviewSummary = {
    reviewedCount: 0,
    suggestedCount: 0,
    noMatchCount: 0,
    errorCount: 0,
  }

  for (const candidate of pendingCandidates) {
    const shortlist = buildToolReviewShortlist(catalog, {
      query: candidate.rawName,
      categoryId: candidate.suggestedCategoryId ?? undefined,
      limit: serverSettings.toolCandidateReview.shortlistSize,
      minSimilarity: serverSettings.toolCandidateReview.minShortlistSimilarity,
    })

    if (shortlist.length === 0) {
      await persistReviewResult(database, candidate.id, {
        reviewedAt: reviewTime,
        reviewModel: null,
        suggestedToolId: null,
        confidence: null,
        reason: 'No shortlist cleared the similarity threshold',
        error: null,
      })
      summary.reviewedCount++
      summary.noMatchCount++
      continue
    }

    try {
      const completion = await llmService.complete(
        serverSettings.toolCandidateReview.modelProvider,
        {
          model: serverSettings.toolCandidateReview.modelId,
          systemPrompt: buildReviewSystemPrompt(),
          userPrompt: buildReviewUserPrompt(candidate, shortlist),
          temperature: serverSettings.toolCandidateReview.temperature,
          maxTokens: serverSettings.toolCandidateReview.maxTokens,
        },
      )

      const review = parseToolCandidateReviewResponse(
        completion.content,
        new Set(shortlist.map((entry) => entry.tool.id)),
      )

      await persistReviewResult(database, candidate.id, {
        reviewedAt: reviewTime,
        reviewModel: completion.returnedModel,
        suggestedToolId: review.tool_id,
        confidence: review.tool_id ? review.confidence : null,
        reason: review.reason,
        error: null,
      })

      summary.reviewedCount++
      if (review.tool_id) {
        summary.suggestedCount++
      } else {
        summary.noMatchCount++
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown review error'

      await persistReviewResult(database, candidate.id, {
        reviewedAt: reviewTime,
        reviewModel: serverSettings.toolCandidateReview.modelId,
        suggestedToolId: null,
        confidence: null,
        reason: null,
        error: message,
      })

      summary.reviewedCount++
      summary.errorCount++
    }
  }

  return summary
}
