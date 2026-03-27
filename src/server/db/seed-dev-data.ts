/**
 * Development-only seed script for synthetic benchmark and critic data.
 * Run with: pnpm db:seed-dev
 *
 * Creates a benchmark protocol, season, weight config, prompt versions,
 * model snapshots, cases, a published run with results/decisions,
 * and sample critic profiles with comments.
 *
 * Prerequisites: Run `pnpm db:seed` first to create categories, tools, LLMs, and prompts.
 *
 * All operations are idempotent (safe to run multiple times).
 */

import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { classifyModelTier, extractModelFamilyKey } from '~/server/llm/benchmark/model-tier'

import * as schema from './schema'

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required')
  process.exit(1)
}

const conn = postgres(DATABASE_URL)
const db = drizzle(conn, { schema })

// ============================================================================
// SEED DATA
// ============================================================================

const CATEGORY_TOOL_PRIORITIES: Record<string, string[]> = {
  auth: ['clerk', 'nextauth', 'auth0', 'lucia'],
  database: ['supabase', 'neon', 'planetscale', 'firebase', 'mongodb-atlas', 'turso'],
  orm: ['prisma', 'drizzle', 'kysely', 'typeorm'],
  email: ['resend', 'sendgrid', 'postmark', 'amazon-ses', 'mailgun'],
  payments: ['stripe', 'paddle', 'lemonsqueezy', 'paypal'],
  storage: ['cloudinary', 'uploadthing', 'aws-s3', 'cloudflare-r2'],
  hosting: ['vercel', 'netlify', 'railway', 'fly-io', 'render', 'cloudflare-pages'],
  styling: ['tailwind-css', 'bootstrap', 'panda-css'],
  'ui-components': ['shadcn-ui', 'radix-ui', 'chakra-ui', 'mui', 'ant-design', 'mantine'],
  state: ['shadcn-ui'], // placeholder — no dedicated state tools seeded
  api: ['trpc', 'apollo-graphql', 'hono'],
  cms: ['sanity', 'contentful', 'strapi', 'payload-cms'],
  search: ['algolia', 'typesense', 'meilisearch', 'elasticsearch'],
  analytics: ['posthog', 'plausible', 'mixpanel', 'google-analytics'],
  monitoring: ['sentry', 'logrocket', 'datadog'],
  ai: ['openai', 'anthropic', 'replicate', 'hugging-face'],
  realtime: ['pusher', 'ably', 'socket-io'],
  testing: ['vitest', 'jest', 'playwright', 'cypress'],
  'ci-cd': ['github-actions', 'vercel', 'circleci'],
  jobs: ['inngest', 'trigger-dev', 'bullmq', 'quirrel'],
  notifications: ['novu', 'onesignal'],
}

const CRITIC_USERS = [
  {
    email: 'sarah.chen@example.com',
    displayName: 'Sarah Chen',
    bio: 'Full-stack developer and tech reviewer with 10+ years of experience',
    company: 'TechReview Inc.',
    title: 'Senior Developer Advocate',
    expertiseAreas: ['auth', 'database', 'hosting'],
  },
  {
    email: 'marcus.rivera@example.com',
    displayName: 'Marcus Rivera',
    bio: 'Cloud infrastructure specialist and open-source contributor',
    company: 'CloudOps',
    title: 'Principal Engineer',
    expertiseAreas: ['hosting', 'monitoring', 'ci-cd'],
  },
  {
    email: 'aiko.tanaka@example.com',
    displayName: 'Aiko Tanaka',
    bio: 'Frontend architect and design systems lead',
    company: 'DesignLab',
    title: 'Staff Frontend Engineer',
    expertiseAreas: ['styling', 'ui-components', 'state'],
  },
]

const SAMPLE_COMMENTS: Array<{
  criticIndex: number
  targetType: 'tool' | 'prompt'
  targetSlug: string
  targetLevel?: string
  content: string
}> = [
  {
    criticIndex: 0,
    targetType: 'tool',
    targetSlug: 'clerk',
    content:
      'Clerk has become my go-to for auth in new projects. The DX is unmatched — pre-built components, webhooks, and multi-tenancy support out of the box.',
  },
  {
    criticIndex: 0,
    targetType: 'tool',
    targetSlug: 'supabase',
    content:
      'Supabase continues to impress. The combination of Postgres, auth, storage, and realtime in one platform makes it incredibly productive for MVPs.',
  },
  {
    criticIndex: 1,
    targetType: 'tool',
    targetSlug: 'vercel',
    content:
      'Vercel deployment experience is seamless. Preview deployments and edge functions make it the gold standard for Next.js hosting.',
  },
  {
    criticIndex: 1,
    targetType: 'tool',
    targetSlug: 'sentry',
    content:
      'Sentry remains essential for production monitoring. The source map integration and session replay features are game-changers for debugging.',
  },
  {
    criticIndex: 2,
    targetType: 'tool',
    targetSlug: 'tailwind-css',
    content:
      'Tailwind CSS v4 is a massive leap forward. The new engine is faster, the config is simpler, and the composability with modern frameworks is excellent.',
  },
  {
    criticIndex: 2,
    targetType: 'tool',
    targetSlug: 'shadcn-ui',
    content:
      'shadcn/ui changed how I think about component libraries. Copy-paste ownership means no version lock-in, and the Radix primitives underneath are rock solid.',
  },
  {
    criticIndex: 0,
    targetType: 'prompt',
    targetSlug: 'saas-application',
    targetLevel: 'intermediate',
    content:
      'This prompt does a great job testing the full SaaS stack. Interesting to see how models handle the auth + billing intersection.',
  },
  {
    criticIndex: 1,
    targetType: 'prompt',
    targetSlug: 'real-estate-website',
    targetLevel: 'beginner',
    content:
      'A solid beginner prompt that covers the core web app categories. The image storage requirement is a nice touch.',
  },
  {
    criticIndex: 2,
    targetType: 'prompt',
    targetSlug: 'social-media-platform',
    targetLevel: 'advanced',
    content:
      'The most demanding prompt in the set. Real-time features + media uploads + notifications creates a complex decision matrix for models.',
  },
]

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function seedBenchmarkData() {
  console.log('Seeding benchmark data...')

  // 1. Create protocol
  const [protocol] = await db
    .insert(schema.benchmarkProtocols)
    .values({
      slug: 'v1-benchmark',
      name: 'V1 Benchmark Protocol',
      description: 'Standard benchmark protocol for tool recommendation evaluation',
      mode: 'benchmark',
      parserVersion: '1.0',
      scoringVersion: '1.0',
      promptContractVersion: '1.0',
    })
    .onConflictDoNothing()
    .returning()

  const protocolRow =
    protocol ??
    (await db.query.benchmarkProtocols.findFirst({
      where: (t, { eq: e }) => e(t.slug, 'v1-benchmark'),
    }))

  if (!protocolRow) {
    console.warn('  Could not create or find benchmark protocol, skipping benchmark data')
    return
  }

  // 2. Create season
  const [season] = await db
    .insert(schema.benchmarkSeasons)
    .values({
      protocolId: protocolRow.id,
      slug: 'season-1',
      name: 'Season 1',
      status: 'active',
      publishedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning()

  const seasonRow =
    season ??
    (await db.query.benchmarkSeasons.findFirst({
      where: (t, { eq: e }) => e(t.slug, 'season-1'),
    }))

  if (!seasonRow) {
    console.warn('  Could not create or find season, skipping benchmark data')
    return
  }

  // 3. Create model weight config
  await db
    .insert(schema.benchmarkModelWeightConfigs)
    .values({
      slug: 'default',
      name: 'Default Weights',
      description: 'Equal weights across all model tiers',
      frontierWeight: 1.0,
      midWeight: 1.0,
      smallWeight: 1.0,
      isActive: true,
    })
    .onConflictDoNothing()

  const weightConfig = await db.query.benchmarkModelWeightConfigs.findFirst({
    where: (t, { eq: e }) => e(t.slug, 'default'),
  })

  // 4. Create prompt versions from existing prompts
  const allPrompts = await db.select().from(schema.prompts)
  const allSubcategories = await db.select().from(schema.subcategories)
  const subcatMap = new Map(allSubcategories.map((s) => [s.slug, s.id]))

  const promptVersionValues = allPrompts.map((p) => ({
    promptId: p.id,
    slug: p.slug,
    level: p.level as 'beginner' | 'intermediate' | 'advanced',
    version: 1,
    contentMd: p.contentMd ?? p.description ?? '',
    contentHash: createHash('sha256').update(`${p.slug}-${p.level}-v1`).digest('hex'),
    promptContractVersion: '1.0',
    isActive: true,
  }))

  await db.insert(schema.benchmarkPromptVersions).values(promptVersionValues).onConflictDoNothing()
  const allPromptVersions = await db.select().from(schema.benchmarkPromptVersions)
  const pvByPromptId = new Map(allPromptVersions.map((pv) => [pv.promptId, pv]))

  // Create prompt version categories
  const pvCategoryValues: Array<{
    promptVersionId: string
    categoryId: string
    displayOrder: number
  }> = []
  for (const p of allPrompts) {
    const pv = pvByPromptId.get(p.id)
    if (!pv) continue
    const cats = (p.expectedCategories ?? []) as string[]
    for (let i = 0; i < cats.length; i++) {
      const catSlug = cats[i]
      if (!catSlug) continue
      const catId = subcatMap.get(catSlug)
      if (catId) {
        pvCategoryValues.push({
          promptVersionId: pv.id,
          categoryId: catId,
          displayOrder: i,
        })
      }
    }
  }
  if (pvCategoryValues.length > 0) {
    await db
      .insert(schema.benchmarkPromptVersionCategories)
      .values(pvCategoryValues)
      .onConflictDoNothing()
  }

  // 5. Create model snapshots from LLMs
  const allLlms = await db.select().from(schema.llms)
  const snapshotValues = allLlms.map((llm) => ({
    llmId: llm.id,
    name: llm.name,
    provider: llm.provider,
    company: llm.company,
    modelFamily: llm.modelFamily,
    modelVersion: llm.modelVersion,
    tier: classifyModelTier(llm.modelId),
    modelFamilyKey: extractModelFamilyKey(llm.modelId),
    requestedModelId: llm.modelId,
    snapshotKey: `${llm.slug}-seed-v2`,
    isDeterministic: false,
    temperature: 0.7,
    maxTokens: 4096,
  }))

  await db.insert(schema.benchmarkModelSnapshots).values(snapshotValues).onConflictDoNothing()
  const allSnapshots = await db.select().from(schema.benchmarkModelSnapshots)

  // 6. Create season prompts + season models
  const seasonPromptValues = allPromptVersions.map((pv) => ({
    seasonId: seasonRow.id,
    promptVersionId: pv.id,
  }))
  await db.insert(schema.benchmarkSeasonPrompts).values(seasonPromptValues).onConflictDoNothing()

  const seasonModelValues = allSnapshots.map((s) => ({
    seasonId: seasonRow.id,
    modelSnapshotId: s.id,
  }))
  await db.insert(schema.benchmarkSeasonModels).values(seasonModelValues).onConflictDoNothing()

  // 7. Create cases (prompt version × model snapshot)
  const caseValues: Array<{
    seasonId: string
    promptVersionId: string
    modelSnapshotId: string
  }> = []
  for (const pv of allPromptVersions) {
    for (const snap of allSnapshots) {
      caseValues.push({
        seasonId: seasonRow.id,
        promptVersionId: pv.id,
        modelSnapshotId: snap.id,
      })
    }
  }
  await db.insert(schema.benchmarkCases).values(caseValues).onConflictDoNothing()
  const allCases = await db
    .select()
    .from(schema.benchmarkCases)
    .where(sql`${schema.benchmarkCases.seasonId} = ${seasonRow.id}`)

  // 8. Create published run
  const [run] = await db
    .insert(schema.benchmarkRuns)
    .values({
      seasonId: seasonRow.id,
      scheduledFor: '2026-03-20',
      trigger: 'seed',
      status: 'published',
      weightConfigId: weightConfig?.id ?? null,
      startedAt: new Date(),
      completedAt: new Date(),
      expectedCaseCount: allCases.length,
      completedCaseCount: allCases.length,
      failedCaseCount: 0,
    })
    .onConflictDoNothing()
    .returning()

  const runRow =
    run ??
    (await db.query.benchmarkRuns.findFirst({
      where: (t, { and: allOf, eq: e }) =>
        allOf(e(t.seasonId, seasonRow.id), e(t.scheduledFor, '2026-03-20')),
    }))

  if (!runRow) {
    console.warn('  Could not create or find benchmark run, skipping case results')
    return
  }

  // 9. Create case results
  const caseResultValues = allCases.map((c) => ({
    seasonId: seasonRow.id,
    runId: runRow.id,
    caseId: c.id,
    status: 'completed' as const,
  }))
  await db.insert(schema.benchmarkCaseResults).values(caseResultValues).onConflictDoNothing()
  const allCaseResults = await db
    .select()
    .from(schema.benchmarkCaseResults)
    .where(sql`${schema.benchmarkCaseResults.runId} = ${runRow.id}`)

  // Build lookup maps for decisions
  const allTools = await db.select().from(schema.tools)
  const toolSlugToId = new Map(allTools.map((t) => [t.slug, t.id]))
  const caseById = new Map(allCases.map((c) => [c.id, c]))
  const pvById = new Map(allPromptVersions.map((pv) => [pv.id, pv]))
  const promptById = new Map(allPrompts.map((p) => [p.id, p]))
  const snapById = new Map(allSnapshots.map((s) => [s.id, s]))

  // 10. Create decisions for each case result
  const decisionValues: Array<{
    caseResultId: string
    categoryId: string
    decisionType: 'tool'
    toolId: string
  }> = []

  for (const cr of allCaseResults) {
    const benchCase = caseById.get(cr.caseId)
    if (!benchCase) continue
    const pv = pvById.get(benchCase.promptVersionId)
    if (!pv) continue
    const prompt = promptById.get(pv.promptId)
    if (!prompt) continue
    const snap = snapById.get(benchCase.modelSnapshotId)
    if (!snap) continue

    const expectedCats = (prompt.expectedCategories ?? []) as string[]
    // Use model index for variety
    const modelIndex = allSnapshots.findIndex((s) => s.id === snap.id)

    for (const catSlug of expectedCats) {
      const catId = subcatMap.get(catSlug)
      if (!catId) continue

      const toolSlugs = CATEGORY_TOOL_PRIORITIES[catSlug]
      if (!toolSlugs || toolSlugs.length === 0) continue

      // Pick tool based on model index for variety, with bias toward first tools
      const toolIndex = modelIndex % toolSlugs.length
      const toolSlug = toolSlugs[toolIndex]
      if (!toolSlug) continue
      const toolId = toolSlugToId.get(toolSlug)
      if (!toolId) continue

      decisionValues.push({
        caseResultId: cr.id,
        categoryId: catId,
        decisionType: 'tool',
        toolId,
      })
    }
  }

  if (decisionValues.length > 0) {
    await db.insert(schema.benchmarkCaseDecisions).values(decisionValues).onConflictDoNothing()
  }

  console.log(
    `  Benchmark data ready: ${allPromptVersions.length} prompt versions, ${allSnapshots.length} model snapshots, ${allCases.length} cases, ${decisionValues.length} decisions`,
  )
}

async function seedCritics() {
  console.log('Seeding critics...')

  const adminUser = await db.query.userProfiles.findFirst({
    where: (t, { eq: e }) => e(t.role, 'admin'),
  })

  const criticIds: string[] = []
  for (const critic of CRITIC_USERS) {
    // Create user profile (no auth user — these are seed-only placeholder critics)
    const userId = crypto.randomUUID()
    await db
      .insert(schema.userProfiles)
      .values({
        id: userId,
        email: critic.email,
        displayName: critic.displayName,
        bio: critic.bio,
        company: critic.company,
        role: 'critic',
      })
      .onConflictDoNothing()

    const userRow = await db.query.userProfiles.findFirst({
      where: (t, { eq: e }) => e(t.email, critic.email),
    })
    if (!userRow) continue

    // Create critic profile (verified)
    const criticSlug = critic.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    await db
      .insert(schema.criticProfiles)
      .values({
        slug: criticSlug,
        userId: userRow.id,
        title: critic.title,
        expertiseAreas: critic.expertiseAreas,
        isActive: true,
        verifiedAt: new Date(),
        verifiedBy: adminUser?.id ?? null,
      })
      .onConflictDoNothing()

    const criticRow = await db.query.criticProfiles.findFirst({
      where: (t, { eq: e }) => e(t.userId, userRow.id),
    })
    if (criticRow) criticIds.push(criticRow.id)
  }

  // Retrieve verified critic profiles for comment insertion
  const criticProfiles = await db.query.criticProfiles.findMany({
    where: (t, { inArray: isIn }) => isIn(t.id, criticIds),
  })
  if (criticProfiles.length === 0) {
    console.warn('  No critic profiles found, skipping comments')
    return
  }

  // Get tool and prompt ID maps for comment targets
  const allTools = await db.select().from(schema.tools)
  const toolSlugToId = new Map(allTools.map((t) => [t.slug, t.id]))
  const allPrompts = await db.select().from(schema.prompts)
  const promptKeyToId = new Map(allPrompts.map((p) => [`${p.slug}-${p.level}`, p.id]))

  let commentCount = 0
  for (const sc of SAMPLE_COMMENTS) {
    const critic = criticProfiles[sc.criticIndex]
    if (!critic) continue

    let targetId: string | undefined
    if (sc.targetType === 'tool') {
      targetId = toolSlugToId.get(sc.targetSlug)
    } else {
      targetId = promptKeyToId.get(`${sc.targetSlug}-${sc.targetLevel ?? 'beginner'}`)
    }
    if (!targetId) continue

    await db
      .insert(schema.comments)
      .values({
        criticId: critic.id,
        targetType: sc.targetType,
        targetId,
        content: sc.content,
      })
      .onConflictDoNothing()
    commentCount++
  }

  console.log(`  ${criticProfiles.length} critics and ${commentCount} comments ready`)
}

// ============================================================================
// MAIN
// ============================================================================

async function seedDevData() {
  await seedBenchmarkData()
  await seedCritics()
  console.log('Dev data seeding complete!')
}

seedDevData()
  .catch((e) => {
    console.error('Dev data seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await conn.end()
  })
