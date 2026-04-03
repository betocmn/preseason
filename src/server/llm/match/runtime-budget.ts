import { serverSettings } from '~/constants/server-settings'

function getMaxRetriedRequestRuntimeMs(timeoutMs: number) {
  const attempts = serverSettings.openRouter.transportRetryAttempts
  const retryDelayMs =
    (serverSettings.openRouter.transportRetryBaseDelayMs * ((attempts - 1) * attempts)) / 2
  return timeoutMs * attempts + retryDelayMs
}

export function getMaxMatchEvaluationRuntimeMs() {
  const maxRequestRuntimeMs = getMaxRetriedRequestRuntimeMs(serverSettings.match.requestTimeoutMs)

  // A single evaluation may need one primary completion and one repair completion.
  return maxRequestRuntimeMs * 2
}
