import { serverSettings } from '~/constants/server-settings'

function getMaxRetriedRequestRuntimeMs(timeoutMs: number) {
  const attempts = serverSettings.openRouter.transportRetryAttempts
  const retryDelayMs =
    (serverSettings.openRouter.transportRetryBaseDelayMs * ((attempts - 1) * attempts)) / 2
  return timeoutMs * attempts + retryDelayMs
}

type MatchEvaluationRuntimeBudgetOptions = {
  retryTerminalEvaluations: boolean
}

export function getMaxMatchEvaluationRuntimeMs(options: MatchEvaluationRuntimeBudgetOptions) {
  const maxRequestRuntimeMs = getMaxRetriedRequestRuntimeMs(serverSettings.match.requestTimeoutMs)
  const llmRequestCount = options.retryTerminalEvaluations ? 3 : 2

  // Retried invalid_output rows may need stored-output repair, a fresh completion, and a repair.
  return maxRequestRuntimeMs * llmRequestCount
}
