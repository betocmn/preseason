import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { serverSettings } from '~/constants/server-settings'

type VercelConfig = {
  crons?: Array<{
    path: string
    schedule: string
  }>
}

function getRouteFile(pathname: string) {
  return path.resolve(process.cwd(), 'src/app', pathname.replace(/^\//, ''), 'route.ts')
}

describe('vercel cron config', () => {
  function readCronConfig() {
    return JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as VercelConfig
  }

  it('references only route handlers that exist in the app directory', () => {
    const config = readCronConfig()

    const missingRoutes = (config.crons ?? [])
      .map((cron) => ({
        path: cron.path,
        routeFile: getRouteFile(cron.path),
      }))
      .filter((cron) => !existsSync(cron.routeFile))

    expect(missingRoutes).toEqual([])
  })

  it('runs benchmark, match, and tool review crons on the expected schedules', () => {
    const config = readCronConfig()
    const cronByPath = new Map((config.crons ?? []).map((cron) => [cron.path, cron.schedule]))

    expect(cronByPath.get('/api/cron/benchmark-run')).toBe('*/6 * * * *')
    expect(cronByPath.get('/api/cron/match-run')).toBe('0 0 */2 * *')
    expect(cronByPath.get('/api/cron/tool-candidate-review')).toBe('0 * * * *')
  })

  it('keeps enough benchmark cron capacity to drain the reference run before the next cadence', () => {
    const config = readCronConfig()
    const cronByPath = new Map((config.crons ?? []).map((cron) => [cron.path, cron.schedule]))
    const benchmarkCronMinutes = 6
    const referenceBenchmarkCaseCount = 900

    expect(cronByPath.get('/api/cron/benchmark-run')).toBe('*/6 * * * *')
    expect(serverSettings.benchmark.newRunIntervalHours).toBe(14 * 24)
    expect(
      (serverSettings.benchmark.newRunIntervalHours *
        60 *
        serverSettings.benchmark.casesPerCronInvocation) /
        benchmarkCronMinutes,
    ).toBeGreaterThan(referenceBenchmarkCaseCount)
  })

  it('keeps enough match cron capacity to drain a reference batch before the next benchmark run', () => {
    const config = readCronConfig()
    const cronByPath = new Map((config.crons ?? []).map((cron) => [cron.path, cron.schedule]))
    const matchCronDays = 2
    const referenceSeededModelCount = 20
    const referenceMatchEvaluationCount =
      (referenceSeededModelCount - serverSettings.match.excludedRequestedModelIds.length) * 2

    expect(cronByPath.get('/api/cron/match-run')).toBe('0 0 */2 * *')
    expect(
      (serverSettings.benchmark.newRunIntervalHours / 24 / matchCronDays) *
        serverSettings.match.cronEvaluationsPerInvocation,
    ).toBeGreaterThanOrEqual(referenceMatchEvaluationCount)
  })
})
