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
    casesPerCronInvocation: 8,
    staleRunThresholdMs: 15 * 60 * 1000,
    heartbeatIntervalMs: 5 * 60 * 1000,
  },
  backgroundSmoke: {
    promptSelections: backgroundSmokePromptSelections,
  },
} as const
