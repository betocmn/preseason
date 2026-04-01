import type { PromptLevel } from '~/server/llm/prompts'

const benchmarkCronMaxDurationSeconds = 800
const benchmarkCaseClaimSafetyBufferMs = 2 * 60 * 1000

const backgroundSmokePromptSelections = [
  { slug: 'real-estate-website', level: 'beginner' },
  { slug: 'chat-application', level: 'beginner' },
] as const satisfies readonly {
  slug: string
  level: PromptLevel
}[]

export const serverSettings = {
  homepage: {
    promptCarouselPageSize: 5,
    promptCarouselRevalidateSeconds: 3_600,
    promptCarouselSnapshotMaxRunIds: 1_000,
  },
  benchmark: {
    promptContractVersion: '1.1',
    // Keep this aligned with src/app/api/cron/benchmark-run/route.ts maxDuration.
    // Bound benchmark cron work so each invocation stays short and resumable.
    cronMaxDurationSeconds: benchmarkCronMaxDurationSeconds,
    casesPerCronInvocation: 1,
    // Stop retrying a case after this many attempts to avoid burning API credits.
    maxCaseAttempts: 3,
    // Do not reclaim an in-flight case before the benchmark worker itself can time out.
    caseClaimStaleAfterMs:
      benchmarkCronMaxDurationSeconds * 1000 + benchmarkCaseClaimSafetyBufferMs,
    modelDefaults: {
      temperature: 0.2,
      topP: 1,
      maxTokens: 4096,
    },
    outputRepair: {
      modelProvider: 'openai',
      modelId: 'openai/gpt-5.4-mini',
      temperature: 0,
      maxTokens: 700,
    },
  },
  openRouter: {
    transportRetryAttempts: 3,
    transportRetryBaseDelayMs: 1_000,
  },
  toolCandidateReview: {
    cronBatchSize: 8,
    shortlistSize: 6,
    minShortlistSimilarity: 0.45,
    autoApproveConfidence: 0.9,
    modelProvider: 'openai',
    modelId: 'openai/gpt-5.4-mini',
    temperature: 0,
    maxTokens: 350,
  },
  backgroundSmoke: {
    promptSelections: backgroundSmokePromptSelections,
  },
  supabasePooler: {
    hostnameSuffix: '.pooler.supabase.com',
    port: '6543',
  },
} as const
