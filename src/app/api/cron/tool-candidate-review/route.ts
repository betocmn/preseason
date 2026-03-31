import { NextResponse } from 'next/server'
import { env } from '~/env'
import { isCronRequestAuthorized } from '~/lib/cron-auth'
import { db } from '~/server/db'
import { reviewPendingToolCandidates } from '~/server/llm/benchmark/tool-candidate-reviewer'

export const dynamic = 'force-dynamic'
export const maxDuration = 800

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }

  if (!isCronRequestAuthorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await reviewPendingToolCandidates({ database: db })
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
