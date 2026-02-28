import { NextResponse } from 'next/server'
import { env } from '~/env'
import { generateMatches } from '~/server/llm/automation/match-generator'
import { settleExpiredMatches } from '~/server/llm/automation/match-settler'

export const dynamic = 'force-dynamic'

function isAuthorized(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return false
  }

  const token = authHeader.slice('Bearer '.length).trim()
  return token.length > 0 && token === env.CRON_SECRET
}

export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const settled = await settleExpiredMatches()
    const generated = await generateMatches()

    return NextResponse.json({
      ok: true,
      settled,
      generated,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
