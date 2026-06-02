import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '~/server/db'

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`)
    return NextResponse.json({ status: 'healthy', database: 'connected' })
  } catch (error) {
    console.error('Database health check failed:', error)
    return NextResponse.json({ status: 'unhealthy', database: 'disconnected' }, { status: 503 })
  }
}
