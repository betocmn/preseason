import type { PromptLevel } from '~/server/llm/prompts'

const backgroundSmokePromptSelections = [
  { slug: 'real-estate-website', level: 'beginner' },
  { slug: 'chat-application', level: 'beginner' },
] as const satisfies readonly {
  slug: string
  level: PromptLevel
}[]

export const serverSettings = {
  benchmark: {
    // Bound benchmark cron work so each invocation stays short and resumable.
    casesPerCronInvocation: 4,
    staleRunThresholdMs: 15 * 60 * 1000,
    heartbeatIntervalMs: 5 * 60 * 1000,
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
} as const
