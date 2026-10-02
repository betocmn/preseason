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

  function schedulesFor(pathname: string) {
    return (readCronConfig().crons ?? [])
      .filter((cron) => cron.path === pathname)
      .map((cron) => cron.schedule)
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
    expect(schedulesFor('/api/cron/benchmark-run')).toEqual([
      '* * 5-8,15-18,25-28 * *',
      `*/${serverSettings.benchmark.cronRecoveryIntervalMinutes} * 1-4,9-14,19-24,29-31 * *`,
    ])
    expect(schedulesFor('/api/cron/match-run')).toEqual(['0 12 * * 1,4'])
    expect(schedulesFor('/api/cron/tool-candidate-review')).toEqual(['0 * * * *'])
  })

  it('covers every possible UTC month day exactly once across processing and recovery schedules', () => {
    const days = schedulesFor('/api/cron/benchmark-run').flatMap((schedule) => {
      const dayRanges = schedule.split(' ')[2]?.split(',') ?? []
      return dayRanges.flatMap((range) => {
        const [start = Number.NaN, end = start] = range.split('-').map(Number)
        return Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
      })
    })

    expect(days.sort((a, b) => a - b)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1))
    expect(serverSettings.benchmark.cronRecoveryIntervalMinutes).toBe(15)
  })

  it('keeps capacity for every reference case to use its retry budget within the processing window', () => {
    const benchmarkSchedules = schedulesFor('/api/cron/benchmark-run')
    const benchmarkCronMinutes = 1
    const referenceBenchmarkCaseCount = 1_200
    const processingDays = serverSettings.benchmark.cronProcessingWindowDays
    const processingHours = processingDays * 24 - serverSettings.benchmark.newRunStartUtcHour

    expect(benchmarkSchedules).toContain('* * 5-8,15-18,25-28 * *')
    expect(serverSettings.benchmark.newRunStartUtcHour).toBe(12)
    expect(serverSettings.benchmark.newRunUtcMonthDays).toEqual([5, 15, 25])
    expect(
      (processingHours * 60 * serverSettings.benchmark.casesPerCronInvocation) /
        benchmarkCronMinutes,
    ).toBeGreaterThan(referenceBenchmarkCaseCount * serverSettings.benchmark.maxCaseAttempts)

    const dayRanges = serverSettings.benchmark.newRunUtcMonthDays.map(
      (day) => `${day}-${day + processingDays - 1}`,
    )
    expect(benchmarkSchedules).toContain(`* * ${dayRanges.join(',')} * *`)
    expect(
      Math.max(...serverSettings.benchmark.newRunUtcMonthDays) + processingDays - 1,
    ).toBeLessThanOrEqual(28)
  })

  it('keeps match cron on the expected bounded dispatcher cadence', () => {
    expect(schedulesFor('/api/cron/match-run')).toEqual(['0 12 * * 1,4'])
    expect(serverSettings.match.cronEvaluationsPerInvocation).toBeGreaterThan(0)
    expect(serverSettings.match.cronEvaluationsPerInvocation).toBeLessThanOrEqual(4)
  })
})
