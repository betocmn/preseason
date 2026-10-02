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

    expect(cronByPath.get('/api/cron/benchmark-run')).toBe('* * 5-8,15-18,25-28 * *')
    expect(cronByPath.get('/api/cron/match-run')).toBe('0 12 * * 1,4')
    expect(cronByPath.get('/api/cron/tool-candidate-review')).toBe('0 * * * *')
  })

  it('keeps capacity for every reference case to use its retry budget within the processing window', () => {
    const config = readCronConfig()
    const cronByPath = new Map((config.crons ?? []).map((cron) => [cron.path, cron.schedule]))
    const benchmarkCronMinutes = 1
    const referenceBenchmarkCaseCount = 1_200
    const processingDays = serverSettings.benchmark.cronProcessingWindowDays
    const processingHours = processingDays * 24 - serverSettings.benchmark.newRunStartUtcHour

    expect(cronByPath.get('/api/cron/benchmark-run')).toBe('* * 5-8,15-18,25-28 * *')
    expect(serverSettings.benchmark.newRunStartUtcHour).toBe(12)
    expect(serverSettings.benchmark.newRunUtcMonthDays).toEqual([5, 15, 25])
    expect(
      (processingHours * 60 * serverSettings.benchmark.casesPerCronInvocation) /
        benchmarkCronMinutes,
    ).toBeGreaterThan(referenceBenchmarkCaseCount * serverSettings.benchmark.maxCaseAttempts)

    const dayRanges = serverSettings.benchmark.newRunUtcMonthDays.map(
      (day) => `${day}-${day + processingDays - 1}`,
    )
    expect(cronByPath.get('/api/cron/benchmark-run')).toBe(`* * ${dayRanges.join(',')} * *`)
    expect(
      Math.max(...serverSettings.benchmark.newRunUtcMonthDays) + processingDays - 1,
    ).toBeLessThanOrEqual(28)
  })

  it('keeps match cron on the expected bounded dispatcher cadence', () => {
    const config = readCronConfig()
    const cronByPath = new Map((config.crons ?? []).map((cron) => [cron.path, cron.schedule]))

    expect(cronByPath.get('/api/cron/match-run')).toBe('0 12 * * 1,4')
    expect(serverSettings.match.cronEvaluationsPerInvocation).toBeGreaterThan(0)
    expect(serverSettings.match.cronEvaluationsPerInvocation).toBeLessThanOrEqual(4)
  })
})
