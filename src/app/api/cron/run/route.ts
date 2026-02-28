import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { env } from '~/env'
import { db } from '~/server/db'
import { llms, prompts, runs } from '~/server/db/schema'
import { runAutomation } from '~/server/llm/automation/runner'

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
    const [activePrompts, activeLlms] = await Promise.all([
      db.select({ id: prompts.id }).from(prompts).where(eq(prompts.isActive, true)),
      db.select({ id: llms.id }).from(llms).where(eq(llms.isActive, true)),
    ])

    const promptIds = activePrompts.map((prompt) => prompt.id)
    const llmIds = activeLlms.map((llm) => llm.id)

    const insertedRun = await db
      .insert(runs)
      .values({
        status: 'pending',
        trigger: 'cron',
        promptIds,
        llmIds,
        promptCount: promptIds.length,
        llmCount: llmIds.length,
      })
      .returning({ id: runs.id })

    const run = insertedRun[0]
    if (!run) {
      throw new Error('Failed to create automation run')
    }

    const summary = await runAutomation(run.id)

    return NextResponse.json({
      ok: true,
      summary,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
