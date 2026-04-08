import type { PromptLevel } from '~/server/llm/prompts'

const benchmarkCronMaxDurationSeconds = 800
const benchmarkCaseClaimSafetyBufferMs = 2 * 60 * 1000
const contactRateLimitWindowMs = 60 * 60 * 1000
const matchCronInvocationSafetyBufferMs = 60 * 1000
const openRouterRequestTimeoutMs = 5 * 60 * 1000
const matchRequestTimeoutMs = 2 * 60 * 1000

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
  contact: {
    maxSubmissionsPerIp: 3,
    rateLimitWindowMs: contactRateLimitWindowMs,
    advisoryLockNamespace: 41_028,
    // Default to trusting the single proxy directly in front of the app.
    forwardedForTrustedProxyHops: 1,
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
  match: {
    // Match batches can fan out to one LLM call per model/presentation order pair.
    // Keep cron work bounded so a single invocation never attempts a whole batch.
    cronEvaluationsPerInvocation: 4,
    // Leave time for batch cleanup before the route itself hits the platform limit.
    cronInvocationSafetyBufferMs: matchCronInvocationSafetyBufferMs,
    // Keep the worst-case stored-output recovery and rerun path inside the match route budget.
    requestTimeoutMs: matchRequestTimeoutMs,
    // These models have repeatedly produced low-quality or schema-invalid match output.
    excludedRequestedModelIds: [
      'google/gemini-2.5-pro',
      'meta-llama/llama-4-maverick',
      'meta-llama/llama-4-scout',
      'moonshotai/kimi-k2.5',
      'qwen/qwen3-coder-next',
      'z-ai/glm-5-turbo',
    ],
    outputRepair: {
      modelProvider: 'openai',
      modelId: 'openai/gpt-5.4-mini',
      temperature: 0,
      maxTokens: 900,
    },
  },
  openRouter: {
    // Retry transport failures once while keeping the whole evaluation bounded.
    transportRetryAttempts: 2,
    transportRetryBaseDelayMs: 1_000,
    requestTimeoutMs: openRouterRequestTimeoutMs,
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
