import { desc, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { env } from '~/env'
import { db } from '~/server/db'
import { benchmarkSeasons } from '~/server/db/schema'
import { runBenchmark } from '~/server/llm/benchmark/runner'

export const dynamic = 'force-dynamic'

function isAuthorized(request: Request, expectedToken: string | undefined) {
  if (!expectedToken) {
    return false
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return false
  }

  const token = authHeader.slice('Bearer '.length).trim()
  return token.length > 0 && token === expectedToken
}

function formatScheduledFor(date: Date): string {
  const [scheduledFor] = date.toISOString().split('T')
  return scheduledFor ?? date.toISOString()
}

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }

  if (!isAuthorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const activeSeason = await db.query.benchmarkSeasons.findFirst({
      where: eq(benchmarkSeasons.status, 'active'),
      orderBy: desc(benchmarkSeasons.createdAt),
    })

    if (!activeSeason) {
      return NextResponse.json({ ok: true, message: 'No active benchmark season' })
    }

    const scheduledFor = formatScheduledFor(new Date())
    const summary = await runBenchmark(activeSeason.id, scheduledFor)

    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
