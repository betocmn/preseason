import { NextResponse } from 'next/server'
import { serverSettings } from '~/constants/server-settings'
import { env } from '~/env'
import { isCronRequestAuthorized } from '~/lib/cron-auth'
import { db } from '~/server/db'
import { claimNextMatchBatchExecution } from '~/server/llm/match/batches'
import { runMatchBatch } from '~/server/llm/match/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }

  if (!isCronRequestAuthorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const seasonId = new URL(request.url).searchParams.get('seasonId')
  if (seasonId && !UUID_PATTERN.test(seasonId)) {
    return NextResponse.json({ error: 'seasonId must be a valid UUID' }, { status: 400 })
  }

  try {
    const claim = await claimNextMatchBatchExecution(db, { seasonId: seasonId ?? undefined })

    if (!claim.execute || !claim.claimToken || !claim.batch) {
      return NextResponse.json({ ok: true, message: 'No dispatchable match batch' })
    }

    const summary = await runMatchBatch(claim.batch.id, claim.claimToken, {
      database: db,
      maxEvaluations: serverSettings.match.cronEvaluationsPerInvocation,
    })

    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
