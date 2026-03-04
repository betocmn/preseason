/**
 * Test data generation script for local development
 * Run with: pnpm db:seed-test
 *
 * Generates runs, run_results, recommendations, matches, and critic comments
 * so the public UI can be reviewed with realistic-looking data.
 *
 * Prerequisites: Run `pnpm db:seed` first to create categories, tools, LLMs, and prompts.
 *
 * Idempotent: deletes previous test data (runs, matches, critics) then re-creates.
 */

import { inArray, like, sql } from 'drizzle-orm'
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

function randomSample<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, shuffled.length))
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

// Verified critic profiles at major tech companies (none make the tools being reviewed)
const TEST_CRITICS = [
  {
    displayName: 'Sarah Chen',
    email: 'critic-sarah@preseason-test.local',
    company: 'Netflix',
    title: 'VP of Engineering',
    expertiseAreas: ['infrastructure', 'streaming', 'scalability'],
  },
  {
    displayName: 'Marcus Johnson',
    email: 'critic-marcus@preseason-test.local',
    company: 'Spotify',
    title: 'Staff Engineer',
    expertiseAreas: ['data-engineering', 'microservices', 'real-time'],
  },
  {
    displayName: 'Priya Patel',
    email: 'critic-priya@preseason-test.local',
    company: 'Airbnb',
    title: 'Engineering Director',
    expertiseAreas: ['marketplace', 'frontend', 'platform'],
  },
  {
    displayName: 'Alex Rivera',
    email: 'critic-alex@preseason-test.local',
    company: 'Shopify',
    title: 'Principal Engineer',
    expertiseAreas: ['e-commerce', 'performance', 'ruby'],
  },
  {
    displayName: 'Jamie Wu',
    email: 'critic-jamie@preseason-test.local',
    company: 'Coinbase',
    title: 'Senior Staff Engineer',
    expertiseAreas: ['security', 'fintech', 'distributed-systems'],
  },
  {
    displayName: 'Elena Kowalski',
    email: 'critic-elena@preseason-test.local',
    company: 'Figma',
    title: 'Engineering Manager',
    expertiseAreas: ['frontend', 'collaboration', 'webassembly'],
  },
  {
    displayName: 'David Kim',
    email: 'critic-david@preseason-test.local',
    company: 'Linear',
    title: 'CTO',
    expertiseAreas: ['developer-tools', 'real-time', 'typescript'],
  },
  {
    displayName: 'Rachel Thompson',
    email: 'critic-rachel@preseason-test.local',
    company: 'Notion',
    title: 'Staff Frontend Engineer',
    expertiseAreas: ['editor', 'react', 'performance'],
  },
  {
    displayName: 'Omar Hassan',
    email: 'critic-omar@preseason-test.local',
    company: 'Uber',
    title: 'Engineering Lead',
    expertiseAreas: ['payments', 'apis', 'infrastructure'],
  },
  {
    displayName: 'Lisa Park',
    email: 'critic-lisa@preseason-test.local',
    company: 'Discord',
    title: 'Principal Software Engineer',
    expertiseAreas: ['real-time', 'scale', 'rust'],
  },
]

const PROMPT_COMMENT_TEMPLATES = [
  "This prompt does a great job of testing the {category} space. Most LLMs give sensible answers here.",
  "I'd argue this prompt is too vague for experienced devs. It lets LLMs get away with surface-level answers.",
  "At {company}, we ran a similar evaluation internally. The results here align closely with what we saw.",
  "The expected categories for this prompt need updating. It should also test for monitoring and observability.",
  "Great prompt for beginners. It forces LLMs to make opinionated choices rather than listing every option.",
  "This is one of the more balanced prompts. You can really see which LLMs have strong default recommendations.",
  "I've seen LLMs struggle with this one. The scope is broad enough that their answers vary wildly between runs.",
  "Interesting that the top tools here differ from what I see recommended in the real world at {company}.",
  "This prompt reveals a lot about LLM training data biases. Newer tools get underrepresented consistently.",
  "Would love to see this prompt split into separate beginner and advanced versions for more nuanced results.",
]

const MATCH_COMMENT_TEMPLATES = [
  "We migrated from {toolB} to {toolA} six months ago and haven't looked back. The developer experience improvement was immediate and team velocity increased noticeably.",
  "I've evaluated both extensively. {toolA} has better documentation, but {toolB} has some unique features worth considering. For most teams, {toolA} is the safer bet.",
  'At {company}, we use {toolA} across multiple services. The ecosystem and community support are unmatched in this space.',
  'Hot take: {toolB} is actually better for real-time workloads. But for the general case, {toolA} wins on reliability and long-term support.',
  'Both are solid choices. We went with {toolA} at {company} mainly because of the TypeScript-first approach and type safety.',
  "I've been following this space closely. {toolA} has shipped more meaningful features in the past year than {toolB} has in two. The momentum is clear.",
  "We run {toolA} in production serving millions of requests daily. Rock solid. Tried {toolB} in a POC but it wasn't ready for our scale requirements.",
  'Unpopular opinion: {toolB} has a better core architecture. {toolA} wins mostly on community and ecosystem, not raw technical merit.',
  "The pricing model for {toolA} is much more predictable at scale. We got burned by {toolB}'s costs after crossing certain usage thresholds.",
  'As someone who mentors junior engineers, I always recommend {toolA} first. The learning resources and error messages are significantly better.',
  'From a security standpoint, {toolA} has a more mature vulnerability disclosure process. {toolB} still needs to improve their security posture.',
  "We switched to {toolA} after {toolB}'s reliability issues last year. Can't afford downtime during peak traffic at {company}.",
  'Both tools have their place. For greenfield projects, {toolA} is the clear choice. For legacy integrations, {toolB} might be easier to adopt.',
  'The CI/CD integration story for {toolA} is miles ahead. Saved us weeks of DevOps configuration compared to {toolB}.',
  "I've contributed to both open source projects. {toolA} has a healthier contributor community and faster code review cycles.",
  'At {company} we benchmarked both. {toolA} consistently outperformed on p99 latency. {toolB} was competitive on throughput but the tail latency was concerning.',
  'The migration path from {toolB} to {toolA} is well-documented and we completed it in under two weeks for a mid-size codebase.',
  "I'd pick {toolB} for a weekend project and {toolA} for anything going to production. The operational tooling makes a huge difference.",
  'Having maintained both in production at previous companies, {toolA} requires significantly less operational overhead. The self-healing capabilities are underrated.',
  '{toolA} just announced their new pricing tier which makes it even more competitive. {toolB} needs to respond or risk losing market share.',
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
  // Delete only test critic profiles (scoped to test users by email pattern)
  const testUserIds = await db
    .select({ id: schema.userProfiles.id })
    .from(schema.userProfiles)
    .where(like(schema.userProfiles.email, 'critic-%@preseason-test.local'))
  if (testUserIds.length > 0) {
    await db.delete(schema.criticProfiles).where(
      inArray(
        schema.criticProfiles.userId,
        testUserIds.map((u) => u.id),
      ),
    )
  }
  // Delete only test critic user profiles (matched by seeded test email pattern)
  await db
    .delete(schema.userProfiles)
    .where(like(schema.userProfiles.email, 'critic-%@preseason-test.local'))
  // Clean up test auth users
  await db.execute(sql`
    DELETE FROM auth.users WHERE email LIKE 'critic-%@preseason-test.local'
  `)
  console.log('  Cleaned runs, matches, comments, critic profiles, and test users')
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
  const toolById = new Map(allTools.map((t) => [t.id, t]))

  // Build category -> tool IDs map from toolCategories
  const catTools = new Map<string, string[]>()
  for (const tc of allToolCategories) {
    const cat = allSubcategories.find((c) => c.id === tc.categoryId)
    if (!cat) continue
    const existing = catTools.get(cat.slug) ?? []
    existing.push(tc.toolId)
    catTools.set(cat.slug, existing)
  }

  return {
    allSubcategories,
    allTools,
    allLlms,
    allPrompts,
    catBySlug,
    toolBySlug,
    toolById,
    catTools,
  }
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
    // ==================== Active matches ====================
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
    // New active matches
    {
      catSlug: 'storage',
      toolASlugs: ['cloudflare-r2'],
      toolBSlugs: ['uploadthing'],
      status: 'active',
      daysAgo: 4,
    },
    {
      catSlug: 'storage',
      toolASlugs: ['aws-s3'],
      toolBSlugs: ['supabase'],
      status: 'active',
      daysAgo: 11,
    },
    {
      catSlug: 'realtime',
      toolASlugs: ['supabase'],
      toolBSlugs: ['pusher'],
      status: 'active',
      daysAgo: 3,
    },
    {
      catSlug: 'notifications',
      toolASlugs: ['novu'],
      toolBSlugs: ['onesignal'],
      status: 'active',
      daysAgo: 5,
    },
    {
      catSlug: 'api',
      toolASlugs: ['trpc'],
      toolBSlugs: ['hono'],
      status: 'active',
      daysAgo: 7,
    },
    {
      catSlug: 'auth',
      toolASlugs: ['auth0'],
      toolBSlugs: ['lucia'],
      status: 'active',
      daysAgo: 12,
    },
    {
      catSlug: 'database',
      toolASlugs: ['firebase'],
      toolBSlugs: ['mongodb-atlas'],
      status: 'active',
      daysAgo: 6,
    },
    {
      catSlug: 'hosting',
      toolASlugs: ['cloudflare-pages'],
      toolBSlugs: ['netlify'],
      status: 'active',
      daysAgo: 9,
    },
    {
      catSlug: 'email',
      toolASlugs: ['sendgrid'],
      toolBSlugs: ['amazon-ses'],
      status: 'active',
      daysAgo: 8,
    },
    {
      catSlug: 'ui-components',
      toolASlugs: ['mantine'],
      toolBSlugs: ['chakra-ui'],
      status: 'active',
      daysAgo: 11,
    },
    // ==================== Settled matches ====================
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
    // New settled matches
    {
      catSlug: 'hosting',
      toolASlugs: ['fly-io'],
      toolBSlugs: ['render'],
      status: 'settled',
      daysAgo: 35,
    },
    {
      catSlug: 'analytics',
      toolASlugs: ['mixpanel'],
      toolBSlugs: ['google-analytics'],
      status: 'settled',
      daysAgo: 32,
    },
    {
      catSlug: 'orm',
      toolASlugs: ['kysely'],
      toolBSlugs: ['typeorm'],
      status: 'settled',
      daysAgo: 40,
    },
    {
      catSlug: 'realtime',
      toolASlugs: ['socket-io'],
      toolBSlugs: ['ably'],
      status: 'settled',
      daysAgo: 38,
    },
    {
      catSlug: 'payments',
      toolASlugs: ['paddle'],
      toolBSlugs: ['paypal'],
      status: 'settled',
      daysAgo: 33,
    },
    {
      catSlug: 'api',
      toolASlugs: ['hono'],
      toolBSlugs: ['apollo-graphql'],
      status: 'settled',
      daysAgo: 36,
    },
    {
      catSlug: 'notifications',
      toolASlugs: ['onesignal'],
      toolBSlugs: ['firebase'],
      status: 'settled',
      daysAgo: 42,
    },
    {
      catSlug: 'email',
      toolASlugs: ['resend'],
      toolBSlugs: ['mailgun'],
      status: 'settled',
      daysAgo: 29,
    },
  ]

  console.log(`Creating ${MATCH_DEFS.length} matches...`)
  let count = 0
  const matchIds: string[] = []

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

    const [match] = await db
      .insert(schema.matches)
      .values({
        toolAId,
        toolBId,
        categoryId: cat.id,
        status: def.status,
        startedAt: startDate,
        settledAt:
          def.status === 'settled'
            ? new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000)
            : null,
        periodStart: dateStr(startDate),
        periodEnd,
        toolAScore,
        toolBScore,
        totalPrompts,
        winnerToolId: def.status === 'settled' ? winnerId : null,
      })
      .returning({ id: schema.matches.id })

    if (match) matchIds.push(match.id)
    count++
  }

  const activeCount = MATCH_DEFS.filter((m) => m.status === 'active').length
  const settledCount = MATCH_DEFS.filter((m) => m.status === 'settled').length
  console.log(`  Created ${count} matches (${activeCount} active, ${settledCount} settled)`)

  return matchIds
}

async function seedCriticComments(data: Awaited<ReturnType<typeof loadExistingData>>) {
  const { toolById, allPrompts } = data

  console.log('Creating critic profiles and comments...')

  // Create auth users, user profiles, and critic profiles for test critics
  const criticProfileIds: string[] = []

  for (const critic of TEST_CRITICS) {
    // Create auth user
    const authResult = await db.execute<{ id: string }>(sql`
      INSERT INTO auth.users (
        id, instance_id, email, encrypted_password, email_confirmed_at,
        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
        is_super_admin, role, aud, confirmation_token, email_change,
        email_change_token_new, recovery_token, phone, phone_change,
        phone_change_token, email_change_token_current, reauthentication_token
      ) VALUES (
        gen_random_uuid(), '00000000-0000-0000-0000-000000000000', ${critic.email}, '',
        now(), now(), now(), '{"provider": "email", "providers": ["email"]}',
        '{}', false, 'authenticated', 'authenticated', '', '', '', '', NULL, '', '', '', ''
      )
      RETURNING id
    `)

    const authId = authResult[0]?.id
    if (!authId) {
      console.warn(`  Failed to create auth user for ${critic.email}`)
      continue
    }

    // Create identity
    await db.execute(sql`
      INSERT INTO auth.identities (
        id, user_id, provider_id, provider, identity_data,
        last_sign_in_at, created_at, updated_at
      ) VALUES (
        ${authId}::uuid, ${authId}::uuid, ${critic.email}::varchar, 'email',
        jsonb_build_object('sub', ${authId}::text, 'email', ${critic.email}::text, 'email_verified', true, 'provider', 'email'),
        now(), now(), now()
      )
    `)

    // Create user profile
    await db.insert(schema.userProfiles).values({
      id: authId,
      email: critic.email,
      displayName: critic.displayName,
      company: critic.company,
      role: 'critic',
    })

    // Create critic profile
    const [criticProfile] = await db
      .insert(schema.criticProfiles)
      .values({
        userId: authId,
        title: critic.title,
        expertiseAreas: critic.expertiseAreas,
        verifiedAt: daysAgo(randomInt(30, 180)),
        isActive: true,
      })
      .returning({ id: schema.criticProfiles.id })

    if (criticProfile) criticProfileIds.push(criticProfile.id)
  }

  console.log(`  Created ${criticProfileIds.length} critic profiles`)

  // Load all matches to attach comments
  const allMatches = await db.select().from(schema.matches)

  let commentCount = 0

  for (const match of allMatches) {
    // Each match gets 2-5 comments from random critics
    const numComments = randomInt(2, 5)
    const selectedCritics = randomSample(
      criticProfileIds
        .map((id, idx) => {
          const critic = TEST_CRITICS[idx]
          return critic ? { id, critic } : null
        })
        .filter((c) => c !== null),
      numComments,
    )

    const toolA = toolById.get(match.toolAId)
    const toolB = toolById.get(match.toolBId)
    if (!toolA || !toolB) continue

    for (const { id: criticId, critic } of selectedCritics) {
      const template = randomPick(MATCH_COMMENT_TEMPLATES)
      const content = template
        .replace(/\{toolA\}/g, toolA.name)
        .replace(/\{toolB\}/g, toolB.name)
        .replace(/\{company\}/g, critic.company)

      await db.insert(schema.comments).values({
        criticId,
        targetType: 'match',
        targetId: match.id,
        content,
        isPinned: Math.random() < 0.1,
        createdAt: new Date(
          (match.startedAt?.getTime() ?? Date.now()) + randomInt(1, 10) * 24 * 60 * 60 * 1000,
        ),
      })
      commentCount++
    }
  }

  console.log(`  Created ${commentCount} comments across ${allMatches.length} matches`)

  // Seed prompt comments
  let promptCommentCount = 0

  for (const prompt of allPrompts) {
    const numComments = randomInt(1, 3)
    const selectedCritics = randomSample(
      criticProfileIds
        .map((id, idx) => {
          const critic = TEST_CRITICS[idx]
          return critic ? { id, critic } : null
        })
        .filter((c) => c !== null),
      numComments,
    )

    const category = ((prompt.expectedCategories ?? [])[0] as string) ?? 'development'

    for (const { id: criticId, critic } of selectedCritics) {
      const template = randomPick(PROMPT_COMMENT_TEMPLATES)
      const content = template
        .replace(/\{category\}/g, category)
        .replace(/\{company\}/g, critic.company)

      await db.insert(schema.comments).values({
        criticId,
        targetType: 'prompt',
        targetId: prompt.id,
        content,
        isPinned: Math.random() < 0.05,
        createdAt: daysAgo(randomInt(1, 30)),
      })
      promptCommentCount++
    }
  }

  console.log(`  Created ${promptCommentCount} prompt comments across ${allPrompts.length} prompts`)
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
  await seedCriticComments(data)

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
