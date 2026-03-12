/**
 * Test data generation script for local development
 * Run with: pnpm db:seed-test
 *
 * Generates critic profiles and comments on tools and prompts
 * so the public UI can be reviewed with realistic-looking data.
 *
 * Prerequisites: Run `pnpm db:seed` first to create categories, tools, LLMs, and prompts.
 *
 * Idempotent: deletes previous test data (critics, comments) then re-creates.
 */

import { inArray, like, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { slugify } from '~/lib/slug'
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
  'This prompt does a great job of testing the {category} space. Most LLMs give sensible answers here.',
  "I'd argue this prompt is too vague for experienced devs. It lets LLMs get away with surface-level answers.",
  'At {company}, we ran a similar evaluation internally. The results here align closely with what we saw.',
  'The expected categories for this prompt need updating. It should also test for monitoring and observability.',
  'Great prompt for beginners. It forces LLMs to make opinionated choices rather than listing every option.',
  'This is one of the more balanced prompts. You can really see which LLMs have strong default recommendations.',
  "I've seen LLMs struggle with this one. The scope is broad enough that their answers vary wildly between runs.",
  'Interesting that the top tools here differ from what I see recommended in the real world at {company}.',
  'This prompt reveals a lot about LLM training data biases. Newer tools get underrepresented consistently.',
  'Would love to see this prompt split into separate beginner and advanced versions for more nuanced results.',
]

const TOOL_COMMENT_TEMPLATES = [
  "We've been using {tool} at {company} for over a year now. The developer experience is excellent and it scales well.",
  "I've evaluated {tool} extensively. Great documentation and community support make it easy to adopt.",
  'At {company}, {tool} is our go-to choice in this space. The ecosystem integration is unmatched.',
  '{tool} has shipped more meaningful features in the past year than most competitors. The momentum is clear.',
  'We run {tool} in production serving millions of requests daily at {company}. Rock solid.',
  'The pricing model for {tool} is much more predictable at scale than alternatives.',
  'As someone who mentors junior engineers, I always recommend {tool} first. The learning resources are significantly better.',
  'From a security standpoint, {tool} has a mature vulnerability disclosure process.',
  'The CI/CD integration story for {tool} is miles ahead of competitors.',
  "I've contributed to {tool}'s open source project. Healthy contributor community and fast code review cycles.",
]

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function cleanTestData() {
  console.log('Cleaning previous test data...')
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
  console.log('  Cleaned comments, critic profiles, and test users')
}

async function loadExistingData() {
  console.log('Loading existing seed data...')
  const allTools = await db.select().from(schema.tools)
  const allPrompts = await db.select().from(schema.prompts)

  if (allTools.length === 0 || allPrompts.length === 0) {
    console.error('Missing seed data. Run `pnpm db:seed` first.')
    process.exit(1)
  }

  console.log(`  ${allTools.length} tools, ${allPrompts.length} prompts`)

  return { allTools, allPrompts }
}

async function seedCriticComments(data: Awaited<ReturnType<typeof loadExistingData>>) {
  const { allTools, allPrompts } = data

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
        slug: slugify(critic.displayName, authId),
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

  // Create tool comments
  const toolSubset = randomSample(allTools, Math.min(20, allTools.length))
  let toolCommentCount = 0

  for (const tool of toolSubset) {
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

    for (const { id: criticId, critic } of selectedCritics) {
      const template = randomPick(TOOL_COMMENT_TEMPLATES)
      const content = template
        .replace(/\{tool\}/g, tool.name)
        .replace(/\{company\}/g, critic.company)

      await db.insert(schema.comments).values({
        criticId,
        targetType: 'tool',
        targetId: tool.id,
        content,
        isPinned: Math.random() < 0.1,
        createdAt: daysAgo(randomInt(0, 14)),
      })
      toolCommentCount++
    }
  }

  console.log(`  Created ${toolCommentCount} tool comments across ${toolSubset.length} tools`)

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
        createdAt: daysAgo(randomInt(0, 5)),
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
