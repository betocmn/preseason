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

    expect(cronByPath.get('/api/cron/benchmark-run')).toBe('* * * * *')
    expect(cronByPath.get('/api/cron/match-run')).toBe('0 12 * * 1,4')
    expect(cronByPath.get('/api/cron/tool-candidate-review')).toBe('0 * * * *')
  })

  it('keeps enough benchmark cron capacity to drain the reference run before the next calendar window', () => {
    const config = readCronConfig()
    const cronByPath = new Map((config.crons ?? []).map((cron) => [cron.path, cron.schedule]))
    const benchmarkCronMinutes = 1
    const referenceBenchmarkCaseCount = 1_200
    const shortestBenchmarkWindowGapDays = 8

    expect(cronByPath.get('/api/cron/benchmark-run')).toBe('* * * * *')
    expect(serverSettings.benchmark.newRunStartUtcHour).toBe(12)
    expect(serverSettings.benchmark.newRunUtcMonthDays).toEqual([5, 15, 25])
    expect(
      (shortestBenchmarkWindowGapDays * 24 * 60 * serverSettings.benchmark.casesPerCronInvocation) /
        benchmarkCronMinutes,
    ).toBeGreaterThan(referenceBenchmarkCaseCount)
  })

  it('keeps match cron on the expected bounded dispatcher cadence', () => {
    const config = readCronConfig()
    const cronByPath = new Map((config.crons ?? []).map((cron) => [cron.path, cron.schedule]))

    expect(cronByPath.get('/api/cron/match-run')).toBe('0 12 * * 1,4')
    expect(serverSettings.match.cronEvaluationsPerInvocation).toBeGreaterThan(0)
    expect(serverSettings.match.cronEvaluationsPerInvocation).toBeLessThanOrEqual(4)
  })
})
