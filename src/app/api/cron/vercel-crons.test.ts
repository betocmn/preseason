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
  it('references only route handlers that exist in the app directory', () => {
    const config = JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'),
    ) as VercelConfig

    const missingRoutes = (config.crons ?? [])
      .map((cron) => ({
        path: cron.path,
        routeFile: getRouteFile(cron.path),
      }))
      .filter((cron) => !existsSync(cron.routeFile))

    expect(missingRoutes).toEqual([])
  })
})
