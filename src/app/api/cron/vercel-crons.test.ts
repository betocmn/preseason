import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

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

    expect(cronByPath.get('/api/cron/benchmark-run')).toBe('*/10 * * * *')
    expect(cronByPath.get('/api/cron/match-run')).toBe('*/15 * * * *')
    expect(cronByPath.get('/api/cron/tool-candidate-review')).toBe('*/30 * * * *')
  })
})
