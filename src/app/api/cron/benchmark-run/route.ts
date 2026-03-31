import { NextResponse } from 'next/server'
import { serverSettings } from '~/constants/server-settings'
import { env } from '~/env'
import { isCronRequestAuthorized } from '~/lib/cron-auth'
import { resolveBenchmarkCronRunTarget } from '~/server/api/helpers/benchmark'
import { db } from '~/server/db'
import { runBenchmark } from '~/server/llm/benchmark/runner'

export const dynamic = 'force-dynamic'
// Next.js route segment config must stay a statically analyzable literal.
export const maxDuration = 800

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }

  if (!isCronRequestAuthorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const runTarget = await resolveBenchmarkCronRunTarget(db)
    if (!runTarget) {
      return NextResponse.json({ ok: true, message: 'No active benchmark season' })
    }

    const summary = await runBenchmark(runTarget.seasonId, runTarget.scheduledFor, {
      database: db,
      maxCases: serverSettings.benchmark.casesPerCronInvocation,
    })

    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
