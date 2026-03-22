import { NextResponse } from 'next/server'
import { env } from '~/env'
import { db } from '~/server/db'
import { claimMatchBatchExecution } from '~/server/llm/match/batches'
import { runMatchBatch } from '~/server/llm/match/runner'

export const dynamic = 'force-dynamic'

function isAuthorized(request: Request, expectedToken: string | undefined) {
  if (!expectedToken) return false

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return false

  const token = authHeader.slice('Bearer '.length).trim()
  return token.length > 0 && token === expectedToken
}

export async function POST(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }

  if (!isAuthorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = (await request.json()) as { batchId?: string }
    const batchId = body.batchId

    if (!batchId || typeof batchId !== 'string') {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 })
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

    const summary = await runMatchBatch(batch.id, claimToken, { database: db })

    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
