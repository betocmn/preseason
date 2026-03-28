export const serverSettings = {
  benchmark: {
    // Bound benchmark cron work so each invocation stays short and resumable.
    casesPerCronInvocation: 8,
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
} as const
