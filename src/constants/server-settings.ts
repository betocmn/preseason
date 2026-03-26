export const serverSettings = {
  benchmark: {
    // Bound benchmark cron work so each invocation stays short and resumable.
    casesPerCronInvocation: 8,
    staleRunThresholdMs: 15 * 60 * 1000,
    heartbeatIntervalMs: 5 * 60 * 1000,
  },
} as const
