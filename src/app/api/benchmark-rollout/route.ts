import { NextResponse } from 'next/server'
import { env } from '~/env'
import { isCronRequestAuthorized } from '~/lib/cron-auth'
import { db } from '~/server/db'
import { refreshPublicBenchmarkCache } from '~/server/llm/benchmark/refresh-public-cache'
import { getRangeRolloutManifest } from '~/server/llm/benchmark/rollout-manifest'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!env.CRON_SECRET || !isCronRequestAuthorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(getRangeRolloutManifest())
}

export async function POST(request: Request) {
  if (!env.CRON_SECRET || !isCronRequestAuthorized(request, env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await refreshPublicBenchmarkCache(db)
  return NextResponse.json({ ok: true, fingerprint: getRangeRolloutManifest().fingerprint })
}
