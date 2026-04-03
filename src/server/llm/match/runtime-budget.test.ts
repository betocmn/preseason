import { describe, expect, it } from 'vitest'
import { serverSettings } from '~/constants/server-settings'
import { getMaxMatchEvaluationRuntimeMs } from './runtime-budget'

function getMaxRetriedRequestRuntimeMs() {
  const attempts = serverSettings.openRouter.transportRetryAttempts
  const retryDelayMs =
    (serverSettings.openRouter.transportRetryBaseDelayMs * ((attempts - 1) * attempts)) / 2
  return serverSettings.match.requestTimeoutMs * attempts + retryDelayMs
}

describe('getMaxMatchEvaluationRuntimeMs', () => {
  it('budgets for a primary completion and repair in cron runs', () => {
    expect(
      getMaxMatchEvaluationRuntimeMs({
        retryTerminalEvaluations: false,
      }),
    ).toBe(getMaxRetriedRequestRuntimeMs() * 2)
  })

  it('budgets for stored invalid_output retries in manual reruns', () => {
    expect(
      getMaxMatchEvaluationRuntimeMs({
        retryTerminalEvaluations: true,
      }),
    ).toBe(getMaxRetriedRequestRuntimeMs() * 3)
  })

  it('keeps the manual rerun budget inside the route runtime budget', () => {
    const manualRouteRuntimeBudgetMs = 800_000 - serverSettings.match.cronInvocationSafetyBufferMs

    expect(
      getMaxMatchEvaluationRuntimeMs({
        retryTerminalEvaluations: true,
      }),
    ).toBeLessThan(manualRouteRuntimeBudgetMs)
  })
})
