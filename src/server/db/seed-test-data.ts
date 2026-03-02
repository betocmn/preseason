/**
 * Test data generation script for local development
 * Run with: pnpm db:seed-test
 *
 * Generates runs, run_results, recommendations, and matches so the
 * public UI can be reviewed with realistic-looking data.
 *
 * Prerequisites: Run `pnpm db:seed` first to create categories, tools, LLMs, and prompts.
 *
 * Idempotent: deletes previous test data (runs, matches) then re-creates.
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const conn = postgres(DATABASE_URL)
const db = drizzle(conn, { schema })

// ============================================================================
// HELPERS
// ============================================================================

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function randomPick<T>(arr: T[]): T {
  const idx = Math.floor(Math.random() * arr.length)
  return arr[idx] as T
}

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d
}

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0] as string
}

// Tool preferences per category (slug -> weight 0-1, higher = recommended more often)
const TOOL_WEIGHTS: Record<string, Record<string, number>> = {
  auth: {
    clerk: 0.35,
    nextauth: 0.25,
    supabase: 0.2,
    auth0: 0.1,
    lucia: 0.07,
    firebase: 0.03,
  },
  database: {
    supabase: 0.3,
    neon: 0.25,
    planetscale: 0.2,
    turso: 0.12,
    firebase: 0.08,
    'mongodb-atlas': 0.05,
  },
  orm: { drizzle: 0.4, prisma: 0.35, kysely: 0.15, typeorm: 0.1 },
  email: { resend: 0.45, postmark: 0.2, sendgrid: 0.18, 'amazon-ses': 0.1, mailgun: 0.07 },
  payments: { stripe: 0.55, lemonsqueezy: 0.2, paddle: 0.15, paypal: 0.1 },
  storage: {
    'cloudflare-r2': 0.3,
    uploadthing: 0.25,
    'aws-s3': 0.2,
    supabase: 0.15,
    cloudinary: 0.1,
  },
  hosting: {
    vercel: 0.4,
    railway: 0.2,
    'cloudflare-pages': 0.15,
    netlify: 0.1,
    'fly-io': 0.1,
    render: 0.05,
  },
  styling: { 'tailwind-css': 0.75, 'panda-css': 0.15, bootstrap: 0.1 },
  'ui-components': {
    'shadcn-ui': 0.45,
    'radix-ui': 0.2,
    mantine: 0.15,
    'chakra-ui': 0.1,
    mui: 0.07,
    'ant-design': 0.03,
  },
  state: {},
  api: { trpc: 0.5, hono: 0.3, 'apollo-graphql': 0.2 },
  cms: { sanity: 0.35, 'payload-cms': 0.3, contentful: 0.2, strapi: 0.15 },
  search: { typesense: 0.3, meilisearch: 0.3, algolia: 0.25, elasticsearch: 0.15 },
  analytics: { posthog: 0.4, plausible: 0.3, mixpanel: 0.2, 'google-analytics': 0.1 },
  monitoring: { sentry: 0.6, datadog: 0.25, logrocket: 0.15 },
  ai: { openai: 0.4, anthropic: 0.35, replicate: 0.15, 'hugging-face': 0.1 },
  realtime: { supabase: 0.35, pusher: 0.25, 'socket-io': 0.25, ably: 0.15 },
  testing: { vitest: 0.45, playwright: 0.25, jest: 0.2, cypress: 0.1 },
  'ci-cd': { 'github-actions': 0.6, 'vercel-ci': 0.25, circleci: 0.15 },
  jobs: { inngest: 0.35, 'trigger-dev': 0.35, bullmq: 0.2, quirrel: 0.1 },
  notifications: { novu: 0.4, onesignal: 0.35, firebase: 0.25 },
}

const REASONING_TEMPLATES = [
  'Excellent TypeScript support and developer experience',
  'Best-in-class documentation and community support',
  'Great performance with minimal configuration needed',
  'Modern API design with strong type safety',
  'Ideal for rapid prototyping and production use',
  'Simple setup with powerful features out of the box',
  'Active development and strong ecosystem integration',
  'Reliable choice with proven track record',
  'Seamless integration with the rest of the stack',
  'Outstanding developer ergonomics and tooling',
  'Strong default security model and best practices',
  'Perfect balance of simplicity and flexibility',
  'Well-maintained with frequent updates',
  'Generous free tier suitable for most projects',
  'Excellent serverless and edge support',
]

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function cleanTestData() {
  console.log('Cleaning previous test data...')
  // Cascade deletes will clean run_results and recommendations
  await db.delete(schema.runs)
  await db.delete(schema.matches)
  await db.delete(schema.comments)
  console.log('  Cleaned runs, matches, and comments')
}

async function loadExistingData() {
  console.log('Loading existing seed data...')
  const allSubcategories = await db.select().from(schema.subcategories)
  const allTools = await db.select().from(schema.tools)
  const allLlms = await db.select().from(schema.llms)
  const allPrompts = await db.select().from(schema.prompts)
  const allToolCategories = await db.select().from(schema.toolCategories)

  if (
    allSubcategories.length === 0 ||
    allTools.length === 0 ||
    allLlms.length === 0 ||
    allPrompts.length === 0
  ) {
    console.error('Missing seed data. Run `pnpm db:seed` first.')
    process.exit(1)
  }

  console.log(
    `  ${allSubcategories.length} subcategories, ${allTools.length} tools, ${allLlms.length} LLMs, ${allPrompts.length} prompts`,
  )

  // Build lookup maps
  const catBySlug = new Map(allSubcategories.map((c) => [c.slug, c]))
  const toolBySlug = new Map(allTools.map((t) => [t.slug, t]))

  // Build category -> tool IDs map from toolCategories
  const catTools = new Map<string, string[]>()
  for (const tc of allToolCategories) {
    const cat = allSubcategories.find((c) => c.id === tc.categoryId)
    if (!cat) continue
    const existing = catTools.get(cat.slug) ?? []
    existing.push(tc.toolId)
    catTools.set(cat.slug, existing)
  }

  return { allSubcategories, allTools, allLlms, allPrompts, catBySlug, toolBySlug, catTools }
}

function pickToolForCategory(
  categorySlug: string,
  catTools: Map<string, string[]>,
  toolBySlug: Map<string, { id: string; slug: string }>,
): string | null {
  const weights = TOOL_WEIGHTS[categorySlug]
  if (!weights || Object.keys(weights).length === 0) return null

  const toolIds = catTools.get(categorySlug)
  if (!toolIds || toolIds.length === 0) return null

  // Weighted random selection
  const entries = Object.entries(weights)
  const r = Math.random()
  let cumulative = 0
  for (const [toolSlug, weight] of entries) {
    cumulative += weight
    if (r <= cumulative) {
      const tool = toolBySlug.get(toolSlug)
      if (tool && toolIds.includes(tool.id)) return tool.id
    }
  }

  // Fallback: random tool from category
  return randomPick(toolIds)
}

async function seedRuns(data: Awaited<ReturnType<typeof loadExistingData>>) {
  const { allLlms, allPrompts, catBySlug, toolBySlug, catTools } = data

  const NUM_RUNS = 20
  const runIds: string[] = []

  console.log(`Creating ${NUM_RUNS} runs over the last 30 days...`)

  for (let i = 0; i < NUM_RUNS; i++) {
    const age = Math.floor((i / NUM_RUNS) * 30) // Spread across 30 days
    const startDate = daysAgo(30 - age)
    const endDate = new Date(startDate.getTime() + randomInt(5, 30) * 60 * 1000) // 5-30 min duration

    const [run] = await db
      .insert(schema.runs)
      .values({
        startedAt: startDate,
        completedAt: endDate,
        status: 'completed',
        trigger: i % 5 === 0 ? 'manual' : 'cron',
      })
      .returning({ id: schema.runs.id })

    if (run) runIds.push(run.id)
  }

  console.log(`  Created ${runIds.length} runs`)

  // Create run results + recommendations for each run
  console.log('Creating run results and recommendations...')
  let totalResults = 0
  let totalRecs = 0

  for (const runId of runIds) {
    // Each run tests a subset of prompt × LLM combinations
    const promptSubset = allPrompts.filter(() => Math.random() > 0.3) // ~70% of prompts per run
    const llmSubset = allLlms.filter(() => Math.random() > 0.2) // ~80% of LLMs per run

    for (const prompt of promptSubset) {
      for (const llm of llmSubset) {
        const responseTime = randomInt(800, 15000) // 0.8s to 15s

        const [result] = await db
          .insert(schema.runResults)
          .values({
            runId,
            promptId: prompt.id,
            llmId: llm.id,
            rawResponse: `Simulated response from ${llm.name} for "${prompt.title}"`,
            parseStatus: 'success',
            responseTimeMs: responseTime,
          })
          .returning({ id: schema.runResults.id })

        if (!result) continue
        totalResults++

        // Generate recommendations based on prompt's expected categories
        const expectedCats = (prompt.expectedCategories ?? []) as string[]
        let rank = 1

        for (const catSlug of expectedCats) {
          const cat = catBySlug.get(catSlug)
          if (!cat) continue

          const toolId = pickToolForCategory(catSlug, catTools, toolBySlug)
          if (!toolId) continue

          await db.insert(schema.recommendations).values({
            runResultId: result.id,
            toolId,
            categoryId: cat.id,
            confidence: randomFloat(0.6, 0.98),
            reasoning: randomPick(REASONING_TEMPLATES),
            rank: rank++,
          })
          totalRecs++
        }
      }
    }
  }

  console.log(`  Created ${totalResults} run results`)
  console.log(`  Created ${totalRecs} recommendations`)
  return runIds
}

async function seedMatches(data: Awaited<ReturnType<typeof loadExistingData>>) {
  const { catBySlug, toolBySlug } = data

  // Define matches to create: pairs of tools competing in a category
  const MATCH_DEFS: Array<{
    catSlug: string
    toolASlugs: string[]
    toolBSlugs: string[]
    status: 'active' | 'settled'
    daysAgo: number
  }> = [
    // Active matches
    {
      catSlug: 'auth',
      toolASlugs: ['clerk'],
      toolBSlugs: ['nextauth'],
      status: 'active',
      daysAgo: 7,
    },
    {
      catSlug: 'database',
      toolASlugs: ['supabase'],
      toolBSlugs: ['neon'],
      status: 'active',
      daysAgo: 5,
    },
    {
      catSlug: 'orm',
      toolASlugs: ['drizzle'],
      toolBSlugs: ['prisma'],
      status: 'active',
      daysAgo: 10,
    },
    {
      catSlug: 'payments',
      toolASlugs: ['stripe'],
      toolBSlugs: ['lemonsqueezy'],
      status: 'active',
      daysAgo: 3,
    },
    {
      catSlug: 'hosting',
      toolASlugs: ['vercel'],
      toolBSlugs: ['railway'],
      status: 'active',
      daysAgo: 8,
    },
    {
      catSlug: 'email',
      toolASlugs: ['resend'],
      toolBSlugs: ['postmark'],
      status: 'active',
      daysAgo: 6,
    },
    {
      catSlug: 'ui-components',
      toolASlugs: ['shadcn-ui'],
      toolBSlugs: ['radix-ui'],
      status: 'active',
      daysAgo: 4,
    },
    {
      catSlug: 'ai',
      toolASlugs: ['anthropic'],
      toolBSlugs: ['openai'],
      status: 'active',
      daysAgo: 2,
    },
    {
      catSlug: 'analytics',
      toolASlugs: ['posthog'],
      toolBSlugs: ['plausible'],
      status: 'active',
      daysAgo: 9,
    },
    {
      catSlug: 'monitoring',
      toolASlugs: ['sentry'],
      toolBSlugs: ['datadog'],
      status: 'active',
      daysAgo: 6,
    },
    // Settled matches
    {
      catSlug: 'styling',
      toolASlugs: ['tailwind-css'],
      toolBSlugs: ['panda-css'],
      status: 'settled',
      daysAgo: 30,
    },
    {
      catSlug: 'auth',
      toolASlugs: ['supabase'],
      toolBSlugs: ['firebase'],
      status: 'settled',
      daysAgo: 25,
    },
    {
      catSlug: 'database',
      toolASlugs: ['planetscale'],
      toolBSlugs: ['turso'],
      status: 'settled',
      daysAgo: 28,
    },
    {
      catSlug: 'search',
      toolASlugs: ['typesense'],
      toolBSlugs: ['meilisearch'],
      status: 'settled',
      daysAgo: 22,
    },
    {
      catSlug: 'testing',
      toolASlugs: ['vitest'],
      toolBSlugs: ['jest'],
      status: 'settled',
      daysAgo: 20,
    },
    {
      catSlug: 'ci-cd',
      toolASlugs: ['github-actions'],
      toolBSlugs: ['circleci'],
      status: 'settled',
      daysAgo: 18,
    },
    {
      catSlug: 'cms',
      toolASlugs: ['sanity'],
      toolBSlugs: ['strapi'],
      status: 'settled',
      daysAgo: 26,
    },
    {
      catSlug: 'jobs',
      toolASlugs: ['inngest'],
      toolBSlugs: ['trigger-dev'],
      status: 'settled',
      daysAgo: 24,
    },
  ]

  console.log(`Creating ${MATCH_DEFS.length} matches...`)
  let count = 0

  for (const def of MATCH_DEFS) {
    const cat = catBySlug.get(def.catSlug)
    if (!cat) {
      console.warn(`  Category not found: ${def.catSlug}`)
      continue
    }

    const toolASlug = def.toolASlugs[0]
    const toolBSlug = def.toolBSlugs[0]
    if (!toolASlug || !toolBSlug) continue
    const toolAObj = toolBySlug.get(toolASlug)
    const toolBObj = toolBySlug.get(toolBSlug)
    if (!toolAObj || !toolBObj) {
      console.warn(`  Tools not found for match in ${def.catSlug}`)
      continue
    }

    // Enforce tool_a_id < tool_b_id (DB check constraint)
    const [toolAId, toolBId] =
      toolAObj.id < toolBObj.id ? [toolAObj.id, toolBObj.id] : [toolBObj.id, toolAObj.id]

    const startDate = daysAgo(def.daysAgo)
    const totalPrompts = randomInt(40, 120)

    // Generate scores - dominant tool gets more
    const toolAScore =
      def.status === 'settled' ? randomInt(30, totalPrompts - 10) : randomInt(15, totalPrompts - 5)
    const toolBScore = totalPrompts - toolAScore

    // For settled matches, pick the winner
    const winnerId = toolAScore > toolBScore ? toolAId : toolBId

    const periodEnd = dateStr(new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000))

    await db.insert(schema.matches).values({
      toolAId,
      toolBId,
      categoryId: cat.id,
      status: def.status,
      startedAt: startDate,
      settledAt:
        def.status === 'settled' ? new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000) : null,
      periodStart: dateStr(startDate),
      periodEnd,
      toolAScore,
      toolBScore,
      totalPrompts,
      winnerToolId: def.status === 'settled' ? winnerId : null,
    })
    count++
  }

  console.log(
    `  Created ${count} matches (${MATCH_DEFS.filter((m) => m.status === 'active').length} active, ${MATCH_DEFS.filter((m) => m.status === 'settled').length} settled)`,
  )
}

// ============================================================================
// MAIN
// ============================================================================

async function seedTestData() {
  console.log('=== Test Data Generation ===\n')

  await cleanTestData()
  const data = await loadExistingData()
  await seedRuns(data)
  await seedMatches(data)

  console.log('\nTest data generation complete!')
}

seedTestData()
  .catch((e) => {
    console.error('Test data generation failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await conn.end()
  })
