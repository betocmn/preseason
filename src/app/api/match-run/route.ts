import { NextResponse } from 'next/server'
import { serverSettings } from '~/constants/server-settings'
import { env } from '~/env'
import { isCronRequestAuthorized } from '~/lib/cron-auth'
import { db } from '~/server/db'
import { claimMatchBatchExecution } from '~/server/llm/match/batches'
import { runMatchBatch } from '~/server/llm/match/runner'

export const dynamic = 'force-dynamic'
export const maxDuration = 800
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getMaxSingleEvaluationRuntimeMs() {
  const attempts = serverSettings.openRouter.transportRetryAttempts
  const retryDelayMs =
    (serverSettings.openRouter.transportRetryBaseDelayMs * ((attempts - 1) * attempts)) / 2
  return serverSettings.openRouter.requestTimeoutMs * attempts + retryDelayMs
}

export async function POST(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }

  if (!isCronRequestAuthorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { batchId?: string }
    const batchId = body.batchId

    if (!batchId || typeof batchId !== 'string') {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 })
    }

    if (!UUID_PATTERN.test(batchId)) {
      return NextResponse.json({ error: 'batchId must be a valid UUID' }, { status: 400 })
    }

    const { batch, claimToken, execute } = await claimMatchBatchExecution(db, batchId)

    if (!execute || !claimToken) {
      return NextResponse.json({
        ok: true,
        message: 'Batch already completed or actively running',
        batch: {
          id: batch.id,
          status: batch.status,
          completedEvaluations: batch.completedEvaluations,
          totalEvaluations: batch.totalEvaluations,
        },
      })
    }

    const summary = await runMatchBatch(batch.id, claimToken, {
      database: db,
      maxRuntimeMs: maxDuration * 1000 - serverSettings.match.cronInvocationSafetyBufferMs,
      minRemainingRuntimeMs: getMaxSingleEvaluationRuntimeMs(),
      retryTerminalEvaluations: true,
    })

    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
