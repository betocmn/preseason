/**
 * Database seed script for local development
 * Run with: pnpm db:seed
 *
 * Seeds admin users, categories, tools, LLMs, and prompts.
 * All operations are idempotent (safe to run multiple times).
 */

import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
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
// SEED DATA
// ============================================================================

const ADMIN_USERS = [{ email: 'humberto.mn@gmail.com', displayName: 'Beto' }]

const CATEGORY_GROUPS = [
  {
    name: 'Devtools',
    slug: 'devtools',
    description: 'Developer tools and infrastructure',
    icon: 'code',
    displayOrder: 1,
  },
  {
    name: 'Salestech',
    slug: 'salestech',
    description: 'Sales technology and CRM tools',
    icon: 'briefcase',
    displayOrder: 2,
  },
  {
    name: 'Martech',
    slug: 'martech',
    description: 'Marketing technology and automation',
    icon: 'megaphone',
    displayOrder: 3,
  },
  {
    name: 'Fintech',
    slug: 'fintech',
    description: 'Financial technology and payments',
    icon: 'dollar-sign',
    displayOrder: 4,
  },
  {
    name: 'HR Tech',
    slug: 'hr-tech',
    description: 'Human resources technology',
    icon: 'users',
    displayOrder: 5,
  },
  {
    name: 'Healthcare',
    slug: 'healthcare',
    description: 'Healthcare technology and services',
    icon: 'heart-pulse',
    displayOrder: 6,
  },
  {
    name: 'Edtech',
    slug: 'edtech',
    description: 'Education technology and learning platforms',
    icon: 'graduation-cap',
    displayOrder: 7,
  },
  {
    name: 'Cybersecurity',
    slug: 'cybersecurity',
    description: 'Cybersecurity tools and services',
    icon: 'shield',
    displayOrder: 8,
  },
]

// Map each subcategory slug to its parent category group slug
const SUBCATEGORY_GROUP_MAP: Record<string, string> = {
  auth: 'devtools',
  database: 'devtools',
  orm: 'devtools',
  email: 'devtools',
  payments: 'devtools',
  storage: 'devtools',
  hosting: 'devtools',
  styling: 'devtools',
  'ui-components': 'devtools',
  state: 'devtools',
  api: 'devtools',
  cms: 'devtools',
  search: 'devtools',
  analytics: 'devtools',
  monitoring: 'devtools',
  ai: 'devtools',
  realtime: 'devtools',
  testing: 'devtools',
  'ci-cd': 'devtools',
  jobs: 'devtools',
  notifications: 'devtools',
}

const SUBCATEGORIES = [
  {
    name: 'Authentication',
    slug: 'auth',
    icon: 'lock',
    displayOrder: 1,
    description: 'User authentication and identity management',
  },
  {
    name: 'Database',
    slug: 'database',
    icon: 'database',
    displayOrder: 2,
    description: 'Database hosting and management',
  },
  {
    name: 'ORM / Data Access',
    slug: 'orm',
    icon: 'layers',
    displayOrder: 3,
    description: 'Object-relational mapping and data access layers',
  },
  {
    name: 'Email',
    slug: 'email',
    icon: 'mail',
    displayOrder: 4,
    description: 'Transactional and marketing email services',
  },
  {
    name: 'Payments',
    slug: 'payments',
    icon: 'credit-card',
    displayOrder: 5,
    description: 'Payment processing and subscription billing',
  },
  {
    name: 'File Storage',
    slug: 'storage',
    icon: 'hard-drive',
    displayOrder: 6,
    description: 'File and object storage services',
  },
  {
    name: 'Hosting / Deployment',
    slug: 'hosting',
    icon: 'cloud',
    displayOrder: 7,
    description: 'Application hosting and deployment platforms',
  },
  {
    name: 'CSS / Styling',
    slug: 'styling',
    icon: 'palette',
    displayOrder: 8,
    description: 'CSS frameworks and styling solutions',
  },
  {
    name: 'UI Components',
    slug: 'ui-components',
    icon: 'layout',
    displayOrder: 9,
    description: 'Component libraries and design systems',
  },
  {
    name: 'State Management',
    slug: 'state',
    icon: 'git-branch',
    displayOrder: 10,
    description: 'Client-side state management libraries',
  },
  {
    name: 'API Framework',
    slug: 'api',
    icon: 'zap',
    displayOrder: 11,
    description: 'API frameworks and protocols',
  },
  {
    name: 'CMS',
    slug: 'cms',
    icon: 'file-text',
    displayOrder: 12,
    description: 'Content management systems',
  },
  {
    name: 'Search',
    slug: 'search',
    icon: 'search',
    displayOrder: 13,
    description: 'Full-text search engines and services',
  },
  {
    name: 'Analytics',
    slug: 'analytics',
    icon: 'bar-chart',
    displayOrder: 14,
    description: 'Product and web analytics',
  },
  {
    name: 'Monitoring / Error Tracking',
    slug: 'monitoring',
    icon: 'activity',
    displayOrder: 15,
    description: 'Application monitoring and error tracking',
  },
  {
    name: 'AI / LLM Integration',
    slug: 'ai',
    icon: 'brain',
    displayOrder: 16,
    description: 'AI and large language model integrations',
  },
  {
    name: 'Realtime',
    slug: 'realtime',
    icon: 'radio',
    displayOrder: 17,
    description: 'Realtime communication and data sync',
  },
  {
    name: 'Testing',
    slug: 'testing',
    icon: 'check-circle',
    displayOrder: 18,
    description: 'Testing frameworks and tools',
  },
  {
    name: 'CI/CD',
    slug: 'ci-cd',
    icon: 'refresh-cw',
    displayOrder: 19,
    description: 'Continuous integration and deployment',
  },
  {
    name: 'Background Jobs',
    slug: 'jobs',
    icon: 'clock',
    displayOrder: 20,
    description: 'Background job processing and task queues',
  },
  {
    name: 'Notifications',
    slug: 'notifications',
    icon: 'bell',
    displayOrder: 21,
    description: 'Push notifications and messaging',
  },
]

const TOOLS = [
  // Auth
  {
    name: 'Clerk',
    slug: 'clerk',
    website: 'https://clerk.com',
    description: 'Drop-in authentication and user management',
    logoUrl: '/logos/clerk.png',
  },
  {
    name: 'Auth0',
    slug: 'auth0',
    website: 'https://auth0.com',
    description: 'Flexible authentication and authorization platform',
    logoUrl: '/logos/auth0.png',
  },
  {
    name: 'NextAuth.js',
    slug: 'nextauth',
    website: 'https://next-auth.js.org',
    description: 'Authentication for Next.js',
    aliases: ['next-auth', 'Auth.js', 'authjs'],
    logoUrl: '/logos/nextauth.png',
  },
  {
    name: 'Lucia',
    slug: 'lucia',
    website: 'https://lucia-auth.com',
    description: 'Lightweight auth library for TypeScript',
    logoUrl: '/logos/lucia.png',
  },
  // Database
  {
    name: 'Supabase',
    slug: 'supabase',
    website: 'https://supabase.com',
    description: 'Open source Firebase alternative with Postgres',
    aliases: ['Supabase Auth', 'Supabase Storage', 'Supabase Realtime'],
    logoUrl: '/logos/supabase.png',
  },
  {
    name: 'PlanetScale',
    slug: 'planetscale',
    website: 'https://planetscale.com',
    description: 'Serverless MySQL platform',
    logoUrl: '/logos/planetscale.png',
  },
  {
    name: 'Neon',
    slug: 'neon',
    website: 'https://neon.tech',
    description: 'Serverless Postgres with branching',
    logoUrl: '/logos/neon.png',
  },
  {
    name: 'Firebase',
    slug: 'firebase',
    website: 'https://firebase.google.com',
    description: 'Google app development platform with Firestore',
    aliases: ['Firebase Auth', 'Firebase Cloud Messaging', 'FCM'],
    logoUrl: '/logos/firebase.png',
  },
  {
    name: 'MongoDB Atlas',
    slug: 'mongodb-atlas',
    website: 'https://www.mongodb.com/atlas',
    description: 'Cloud-hosted MongoDB service',
    logoUrl: '/logos/mongodb-atlas.png',
  },
  {
    name: 'Turso',
    slug: 'turso',
    website: 'https://turso.tech',
    description: 'Edge-hosted SQLite database',
    logoUrl: '/logos/turso.png',
  },
  // ORM
  {
    name: 'Prisma',
    slug: 'prisma',
    website: 'https://prisma.io',
    description: 'Next-generation Node.js and TypeScript ORM',
    logoUrl: '/logos/prisma.png',
  },
  {
    name: 'Drizzle',
    slug: 'drizzle',
    website: 'https://orm.drizzle.team',
    description: 'TypeScript ORM with SQL-like syntax',
    aliases: ['drizzle-orm'],
    logoUrl: '/logos/drizzle.png',
  },
  {
    name: 'Kysely',
    slug: 'kysely',
    website: 'https://kysely.dev',
    description: 'Type-safe SQL query builder for TypeScript',
    logoUrl: '/logos/kysely.png',
  },
  {
    name: 'TypeORM',
    slug: 'typeorm',
    website: 'https://typeorm.io',
    description: 'ORM for TypeScript and JavaScript',
    logoUrl: '/logos/typeorm.png',
  },
  // Email
  {
    name: 'Resend',
    slug: 'resend',
    website: 'https://resend.com',
    description: 'Email API for developers',
    logoUrl: '/logos/resend.png',
  },
  {
    name: 'SendGrid',
    slug: 'sendgrid',
    website: 'https://sendgrid.com',
    description: 'Email delivery and marketing platform',
    logoUrl: '/logos/sendgrid.png',
  },
  {
    name: 'Postmark',
    slug: 'postmark',
    website: 'https://postmarkapp.com',
    description: 'Transactional email service',
    logoUrl: '/logos/postmark.png',
  },
  {
    name: 'Amazon SES',
    slug: 'amazon-ses',
    website: 'https://aws.amazon.com/ses',
    description: 'AWS email sending service',
    aliases: ['SES', 'AWS SES'],
    logoUrl: '/logos/amazon-ses.png',
  },
  {
    name: 'Mailgun',
    slug: 'mailgun',
    website: 'https://www.mailgun.com',
    description: 'Email API service for developers',
    logoUrl: '/logos/mailgun.png',
  },
  // Payments
  {
    name: 'Stripe',
    slug: 'stripe',
    website: 'https://stripe.com',
    description: 'Payment infrastructure for the internet',
    logoUrl: '/logos/stripe.png',
  },
  {
    name: 'Paddle',
    slug: 'paddle',
    website: 'https://paddle.com',
    description: 'Payment platform for SaaS',
    logoUrl: '/logos/paddle.png',
  },
  {
    name: 'LemonSqueezy',
    slug: 'lemonsqueezy',
    website: 'https://lemonsqueezy.com',
    description: 'All-in-one payments for digital products',
    aliases: ['Lemon Squeezy'],
    logoUrl: '/logos/lemonsqueezy.png',
  },
  {
    name: 'PayPal',
    slug: 'paypal',
    website: 'https://developer.paypal.com',
    description: 'Online payment system',
    logoUrl: '/logos/paypal.png',
  },
  // Storage
  {
    name: 'Cloudinary',
    slug: 'cloudinary',
    website: 'https://cloudinary.com',
    description: 'Media management and optimization',
    logoUrl: '/logos/cloudinary.png',
  },
  {
    name: 'UploadThing',
    slug: 'uploadthing',
    website: 'https://uploadthing.com',
    description: 'File uploads for full-stack TypeScript apps',
    logoUrl: '/logos/uploadthing.png',
  },
  {
    name: 'AWS S3',
    slug: 'aws-s3',
    website: 'https://aws.amazon.com/s3',
    description: 'Amazon Simple Storage Service',
    aliases: ['S3', 'Amazon S3'],
    logoUrl: '/logos/aws-s3.png',
  },
  {
    name: 'Cloudflare R2',
    slug: 'cloudflare-r2',
    website: 'https://developers.cloudflare.com/r2',
    description: 'S3-compatible object storage with zero egress',
    logoUrl: '/logos/cloudflare-r2.png',
  },
  // Hosting
  {
    name: 'Vercel',
    slug: 'vercel',
    website: 'https://vercel.com',
    description: 'Frontend deployment and serverless platform',
    logoUrl: '/logos/vercel.png',
  },
  {
    name: 'Netlify',
    slug: 'netlify',
    website: 'https://netlify.com',
    description: 'Web development platform for modern sites',
    logoUrl: '/logos/netlify.png',
  },
  {
    name: 'Railway',
    slug: 'railway',
    website: 'https://railway.app',
    description: 'Infrastructure platform for deployment',
    logoUrl: '/logos/railway.png',
  },
  {
    name: 'Fly.io',
    slug: 'fly-io',
    website: 'https://fly.io',
    description: 'Global application platform',
    aliases: ['Fly', 'flyio'],
    logoUrl: '/logos/fly-io.png',
  },
  {
    name: 'Render',
    slug: 'render',
    website: 'https://render.com',
    description: 'Cloud application hosting',
    logoUrl: '/logos/render.png',
  },
  {
    name: 'Cloudflare Pages',
    slug: 'cloudflare-pages',
    website: 'https://pages.cloudflare.com',
    description: 'JAMstack platform by Cloudflare',
    logoUrl: '/logos/cloudflare-pages.png',
  },
  // Styling
  {
    name: 'Tailwind CSS',
    slug: 'tailwind-css',
    website: 'https://tailwindcss.com',
    description: 'Utility-first CSS framework',
    aliases: ['Tailwind', 'tailwindcss'],
    logoUrl: '/logos/tailwind-css.png',
  },
  {
    name: 'Bootstrap',
    slug: 'bootstrap',
    website: 'https://getbootstrap.com',
    description: 'Popular CSS framework',
    logoUrl: '/logos/bootstrap.png',
  },
  {
    name: 'Panda CSS',
    slug: 'panda-css',
    website: 'https://panda-css.com',
    description: 'CSS-in-JS with build-time generation',
    logoUrl: '/logos/panda-css.png',
  },
  // UI Components
  {
    name: 'shadcn/ui',
    slug: 'shadcn-ui',
    website: 'https://ui.shadcn.com',
    description: 'Beautifully designed components built with Radix UI and Tailwind',
    aliases: ['shadcn', 'shadcnui'],
    logoUrl: '/logos/shadcn-ui.png',
  },
  {
    name: 'Radix UI',
    slug: 'radix-ui',
    website: 'https://radix-ui.com',
    description: 'Unstyled, accessible UI primitives',
    aliases: ['Radix'],
    logoUrl: '/logos/radix-ui.png',
  },
  {
    name: 'Chakra UI',
    slug: 'chakra-ui',
    website: 'https://chakra-ui.com',
    description: 'Simple, modular and accessible component library',
    logoUrl: '/logos/chakra-ui.png',
  },
  {
    name: 'MUI',
    slug: 'mui',
    website: 'https://mui.com',
    description: 'Material Design React components',
    aliases: ['Material UI', 'Material-UI'],
    logoUrl: '/logos/mui.png',
  },
  {
    name: 'Ant Design',
    slug: 'ant-design',
    website: 'https://ant.design',
    description: 'Enterprise-class UI design language',
    aliases: ['antd', 'AntDesign'],
    logoUrl: '/logos/ant-design.png',
  },
  {
    name: 'Mantine',
    slug: 'mantine',
    website: 'https://mantine.dev',
    description: 'Full-featured React component library',
    logoUrl: '/logos/mantine.png',
  },
  // API
  {
    name: 'tRPC',
    slug: 'trpc',
    website: 'https://trpc.io',
    description: 'End-to-end typesafe APIs for TypeScript',
    logoUrl: '/logos/trpc.png',
  },
  {
    name: 'Apollo GraphQL',
    slug: 'apollo-graphql',
    website: 'https://www.apollographql.com',
    description: 'GraphQL implementation for JavaScript',
    aliases: ['Apollo', 'GraphQL'],
    logoUrl: '/logos/apollo-graphql.png',
  },
  {
    name: 'Hono',
    slug: 'hono',
    website: 'https://hono.dev',
    description: 'Small, fast web framework for the edge',
    logoUrl: '/logos/hono.png',
  },
  // Analytics
  {
    name: 'PostHog',
    slug: 'posthog',
    website: 'https://posthog.com',
    description: 'Open source product analytics',
    logoUrl: '/logos/posthog.png',
  },
  {
    name: 'Plausible',
    slug: 'plausible',
    website: 'https://plausible.io',
    description: 'Privacy-friendly web analytics',
    logoUrl: '/logos/plausible.png',
  },
  {
    name: 'Mixpanel',
    slug: 'mixpanel',
    website: 'https://mixpanel.com',
    description: 'Product analytics for user behavior',
    logoUrl: '/logos/mixpanel.png',
  },
  {
    name: 'Google Analytics',
    slug: 'google-analytics',
    website: 'https://analytics.google.com',
    description: 'Web analytics service by Google',
    aliases: ['GA', 'GA4'],
    logoUrl: '/logos/google-analytics.png',
  },
  // Monitoring
  {
    name: 'Sentry',
    slug: 'sentry',
    website: 'https://sentry.io',
    description: 'Application monitoring and error tracking',
    logoUrl: '/logos/sentry.png',
  },
  {
    name: 'LogRocket',
    slug: 'logrocket',
    website: 'https://logrocket.com',
    description: 'Session replay and error tracking',
    logoUrl: '/logos/logrocket.png',
  },
  {
    name: 'Datadog',
    slug: 'datadog',
    website: 'https://datadoghq.com',
    description: 'Cloud monitoring and observability',
    logoUrl: '/logos/datadog.png',
  },
  // AI
  {
    name: 'OpenAI',
    slug: 'openai',
    website: 'https://openai.com',
    description: 'AI models including GPT and DALL-E',
    aliases: ['GPT', 'ChatGPT'],
    logoUrl: '/logos/openai.png',
  },
  {
    name: 'Anthropic',
    slug: 'anthropic',
    website: 'https://anthropic.com',
    description: 'AI safety company building Claude',
    aliases: ['Claude'],
    logoUrl: '/logos/anthropic.png',
  },
  {
    name: 'Replicate',
    slug: 'replicate',
    website: 'https://replicate.com',
    description: 'Run AI models via API',
    logoUrl: '/logos/replicate.png',
  },
  {
    name: 'Hugging Face',
    slug: 'hugging-face',
    website: 'https://huggingface.co',
    description: 'Open source AI model hub',
    aliases: ['HuggingFace'],
    logoUrl: '/logos/hugging-face.png',
  },
  // Realtime / WebSocket
  {
    name: 'Pusher',
    slug: 'pusher',
    website: 'https://pusher.com',
    description: 'Realtime messaging and event infrastructure',
    logoUrl: '/logos/pusher.png',
  },
  {
    name: 'Ably',
    slug: 'ably',
    website: 'https://ably.com',
    description: 'Realtime messaging platform',
    logoUrl: '/logos/ably.png',
  },
  {
    name: 'Socket.io',
    slug: 'socket-io',
    website: 'https://socket.io',
    description: 'Bidirectional event-based communication',
    aliases: ['SocketIO', 'socket.io'],
    logoUrl: '/logos/socket-io.png',
  },
  // Search
  {
    name: 'Algolia',
    slug: 'algolia',
    website: 'https://algolia.com',
    description: 'AI-powered search and discovery',
    logoUrl: '/logos/algolia.png',
  },
  {
    name: 'Typesense',
    slug: 'typesense',
    website: 'https://typesense.org',
    description: 'Open source search engine',
    logoUrl: '/logos/typesense.png',
  },
  {
    name: 'Meilisearch',
    slug: 'meilisearch',
    website: 'https://meilisearch.com',
    description: 'Lightning-fast open source search engine',
    logoUrl: '/logos/meilisearch.png',
  },
  {
    name: 'Elasticsearch',
    slug: 'elasticsearch',
    website: 'https://elastic.co',
    description: 'Distributed search and analytics engine',
    logoUrl: '/logos/elasticsearch.png',
  },
  // Testing
  {
    name: 'Vitest',
    slug: 'vitest',
    website: 'https://vitest.dev',
    description: 'Vite-native unit testing framework',
    logoUrl: '/logos/vitest.png',
  },
  {
    name: 'Jest',
    slug: 'jest',
    website: 'https://jestjs.io',
    description: 'JavaScript testing framework',
    logoUrl: '/logos/jest.png',
  },
  {
    name: 'Playwright',
    slug: 'playwright',
    website: 'https://playwright.dev',
    description: 'End-to-end testing framework',
    logoUrl: '/logos/playwright.png',
  },
  {
    name: 'Cypress',
    slug: 'cypress',
    website: 'https://cypress.io',
    description: 'End-to-end testing for web apps',
    logoUrl: '/logos/cypress.png',
  },
  // CI/CD
  {
    name: 'GitHub Actions',
    slug: 'github-actions',
    website: 'https://github.com/features/actions',
    description: 'CI/CD built into GitHub',
    logoUrl: '/logos/github-actions.png',
  },
  {
    name: 'Vercel CI',
    slug: 'vercel-ci',
    website: 'https://vercel.com',
    description: 'Continuous deployment via Vercel',
    logoUrl: '/logos/vercel-ci.png',
  },
  {
    name: 'CircleCI',
    slug: 'circleci',
    website: 'https://circleci.com',
    description: 'Continuous integration and delivery platform',
    logoUrl: '/logos/circleci.png',
  },
  // Jobs
  {
    name: 'Inngest',
    slug: 'inngest',
    website: 'https://inngest.com',
    description: 'Durable functions and event-driven workflows',
    logoUrl: '/logos/inngest.png',
  },
  {
    name: 'Trigger.dev',
    slug: 'trigger-dev',
    website: 'https://trigger.dev',
    description: 'Background jobs for TypeScript',
    aliases: ['Trigger', 'triggerdev'],
    logoUrl: '/logos/trigger-dev.png',
  },
  {
    name: 'BullMQ',
    slug: 'bullmq',
    website: 'https://bullmq.io',
    description: 'Node.js message queue based on Redis',
    logoUrl: '/logos/bullmq.png',
  },
  {
    name: 'Quirrel',
    slug: 'quirrel',
    website: 'https://quirrel.dev',
    description: 'Job queueing for serverless',
    logoUrl: '/logos/quirrel.png',
  },
  // CMS
  {
    name: 'Sanity',
    slug: 'sanity',
    website: 'https://sanity.io',
    description: 'Structured content platform',
    logoUrl: '/logos/sanity.png',
  },
  {
    name: 'Contentful',
    slug: 'contentful',
    website: 'https://contentful.com',
    description: 'Headless content management',
    logoUrl: '/logos/contentful.png',
  },
  {
    name: 'Strapi',
    slug: 'strapi',
    website: 'https://strapi.io',
    description: 'Open source headless CMS',
    logoUrl: '/logos/strapi.png',
  },
  {
    name: 'Payload CMS',
    slug: 'payload-cms',
    website: 'https://payloadcms.com',
    description: 'TypeScript-first headless CMS',
    aliases: ['Payload'],
    logoUrl: '/logos/payload-cms.png',
  },
  // Notifications
  {
    name: 'Novu',
    slug: 'novu',
    website: 'https://novu.co',
    description: 'Open source notification infrastructure',
    logoUrl: '/logos/novu.png',
  },
  {
    name: 'OneSignal',
    slug: 'onesignal',
    website: 'https://onesignal.com',
    description: 'Push notification service',
    logoUrl: '/logos/onesignal.png',
  },
]

// Map tool slugs to their category slugs (with isPrimary flag)
const TOOL_CATEGORY_ASSIGNMENTS: Array<{
  toolSlug: string
  categorySlug: string
  isPrimary: boolean
}> = [
  // Auth
  { toolSlug: 'clerk', categorySlug: 'auth', isPrimary: true },
  { toolSlug: 'auth0', categorySlug: 'auth', isPrimary: true },
  { toolSlug: 'nextauth', categorySlug: 'auth', isPrimary: true },
  { toolSlug: 'lucia', categorySlug: 'auth', isPrimary: true },
  // Database
  { toolSlug: 'supabase', categorySlug: 'database', isPrimary: true },
  { toolSlug: 'planetscale', categorySlug: 'database', isPrimary: true },
  { toolSlug: 'neon', categorySlug: 'database', isPrimary: true },
  { toolSlug: 'firebase', categorySlug: 'database', isPrimary: true },
  { toolSlug: 'mongodb-atlas', categorySlug: 'database', isPrimary: true },
  { toolSlug: 'turso', categorySlug: 'database', isPrimary: true },
  // ORM
  { toolSlug: 'prisma', categorySlug: 'orm', isPrimary: true },
  { toolSlug: 'drizzle', categorySlug: 'orm', isPrimary: true },
  { toolSlug: 'kysely', categorySlug: 'orm', isPrimary: true },
  { toolSlug: 'typeorm', categorySlug: 'orm', isPrimary: true },
  // Email
  { toolSlug: 'resend', categorySlug: 'email', isPrimary: true },
  { toolSlug: 'sendgrid', categorySlug: 'email', isPrimary: true },
  { toolSlug: 'postmark', categorySlug: 'email', isPrimary: true },
  { toolSlug: 'amazon-ses', categorySlug: 'email', isPrimary: true },
  { toolSlug: 'mailgun', categorySlug: 'email', isPrimary: true },
  // Payments
  { toolSlug: 'stripe', categorySlug: 'payments', isPrimary: true },
  { toolSlug: 'paddle', categorySlug: 'payments', isPrimary: true },
  { toolSlug: 'lemonsqueezy', categorySlug: 'payments', isPrimary: true },
  { toolSlug: 'paypal', categorySlug: 'payments', isPrimary: true },
  // Storage
  { toolSlug: 'cloudinary', categorySlug: 'storage', isPrimary: true },
  { toolSlug: 'uploadthing', categorySlug: 'storage', isPrimary: true },
  { toolSlug: 'aws-s3', categorySlug: 'storage', isPrimary: true },
  { toolSlug: 'cloudflare-r2', categorySlug: 'storage', isPrimary: true },
  // Hosting
  { toolSlug: 'vercel', categorySlug: 'hosting', isPrimary: true },
  { toolSlug: 'netlify', categorySlug: 'hosting', isPrimary: true },
  { toolSlug: 'railway', categorySlug: 'hosting', isPrimary: true },
  { toolSlug: 'fly-io', categorySlug: 'hosting', isPrimary: true },
  { toolSlug: 'render', categorySlug: 'hosting', isPrimary: true },
  { toolSlug: 'cloudflare-pages', categorySlug: 'hosting', isPrimary: true },
  // Styling
  { toolSlug: 'tailwind-css', categorySlug: 'styling', isPrimary: true },
  { toolSlug: 'bootstrap', categorySlug: 'styling', isPrimary: true },
  { toolSlug: 'panda-css', categorySlug: 'styling', isPrimary: true },
  // UI Components
  { toolSlug: 'shadcn-ui', categorySlug: 'ui-components', isPrimary: true },
  { toolSlug: 'radix-ui', categorySlug: 'ui-components', isPrimary: true },
  { toolSlug: 'chakra-ui', categorySlug: 'ui-components', isPrimary: true },
  { toolSlug: 'mui', categorySlug: 'ui-components', isPrimary: true },
  { toolSlug: 'ant-design', categorySlug: 'ui-components', isPrimary: true },
  { toolSlug: 'mantine', categorySlug: 'ui-components', isPrimary: true },
  // API
  { toolSlug: 'trpc', categorySlug: 'api', isPrimary: true },
  { toolSlug: 'apollo-graphql', categorySlug: 'api', isPrimary: true },
  { toolSlug: 'hono', categorySlug: 'api', isPrimary: true },
  // Analytics
  { toolSlug: 'posthog', categorySlug: 'analytics', isPrimary: true },
  { toolSlug: 'plausible', categorySlug: 'analytics', isPrimary: true },
  { toolSlug: 'mixpanel', categorySlug: 'analytics', isPrimary: true },
  { toolSlug: 'google-analytics', categorySlug: 'analytics', isPrimary: true },
  // Monitoring
  { toolSlug: 'sentry', categorySlug: 'monitoring', isPrimary: true },
  { toolSlug: 'logrocket', categorySlug: 'monitoring', isPrimary: true },
  { toolSlug: 'datadog', categorySlug: 'monitoring', isPrimary: true },
  // AI
  { toolSlug: 'openai', categorySlug: 'ai', isPrimary: true },
  { toolSlug: 'anthropic', categorySlug: 'ai', isPrimary: true },
  { toolSlug: 'replicate', categorySlug: 'ai', isPrimary: true },
  { toolSlug: 'hugging-face', categorySlug: 'ai', isPrimary: true },
  // Realtime
  { toolSlug: 'pusher', categorySlug: 'realtime', isPrimary: true },
  { toolSlug: 'ably', categorySlug: 'realtime', isPrimary: true },
  { toolSlug: 'socket-io', categorySlug: 'realtime', isPrimary: true },
  // Search
  { toolSlug: 'algolia', categorySlug: 'search', isPrimary: true },
  { toolSlug: 'typesense', categorySlug: 'search', isPrimary: true },
  { toolSlug: 'meilisearch', categorySlug: 'search', isPrimary: true },
  { toolSlug: 'elasticsearch', categorySlug: 'search', isPrimary: true },
  // Testing
  { toolSlug: 'vitest', categorySlug: 'testing', isPrimary: true },
  { toolSlug: 'jest', categorySlug: 'testing', isPrimary: true },
  { toolSlug: 'playwright', categorySlug: 'testing', isPrimary: true },
  { toolSlug: 'cypress', categorySlug: 'testing', isPrimary: true },
  // CI/CD
  { toolSlug: 'github-actions', categorySlug: 'ci-cd', isPrimary: true },
  { toolSlug: 'vercel-ci', categorySlug: 'ci-cd', isPrimary: true },
  { toolSlug: 'circleci', categorySlug: 'ci-cd', isPrimary: true },
  // Jobs
  { toolSlug: 'inngest', categorySlug: 'jobs', isPrimary: true },
  { toolSlug: 'trigger-dev', categorySlug: 'jobs', isPrimary: true },
  { toolSlug: 'bullmq', categorySlug: 'jobs', isPrimary: true },
  { toolSlug: 'quirrel', categorySlug: 'jobs', isPrimary: true },
  // CMS
  { toolSlug: 'sanity', categorySlug: 'cms', isPrimary: true },
  { toolSlug: 'contentful', categorySlug: 'cms', isPrimary: true },
  { toolSlug: 'strapi', categorySlug: 'cms', isPrimary: true },
  { toolSlug: 'payload-cms', categorySlug: 'cms', isPrimary: true },
  // Notifications
  { toolSlug: 'novu', categorySlug: 'notifications', isPrimary: true },
  { toolSlug: 'onesignal', categorySlug: 'notifications', isPrimary: true },
  // Cross-category assignments (tools that span multiple categories)
  { toolSlug: 'supabase', categorySlug: 'auth', isPrimary: false },
  { toolSlug: 'supabase', categorySlug: 'storage', isPrimary: false },
  { toolSlug: 'supabase', categorySlug: 'realtime', isPrimary: false },
  { toolSlug: 'firebase', categorySlug: 'auth', isPrimary: false },
  { toolSlug: 'firebase', categorySlug: 'storage', isPrimary: false },
  { toolSlug: 'firebase', categorySlug: 'realtime', isPrimary: false },
  { toolSlug: 'firebase', categorySlug: 'notifications', isPrimary: false },
  { toolSlug: 'vercel', categorySlug: 'ci-cd', isPrimary: false },
]

const LLMS = [
  {
    name: 'Claude 3.5 Sonnet',
    slug: 'claude-3-5-sonnet',
    provider: 'Anthropic',
    modelId: 'anthropic/claude-3.5-sonnet',
  },
  { name: 'GPT-4o', slug: 'gpt-4o', provider: 'OpenAI', modelId: 'openai/gpt-4o' },
  {
    name: 'Gemini 1.5 Pro',
    slug: 'gemini-1-5-pro',
    provider: 'Google',
    modelId: 'google/gemini-pro-1.5',
  },
  {
    name: 'Llama 3.1 70B',
    slug: 'llama-3-1-70b',
    provider: 'Meta',
    modelId: 'meta-llama/llama-3.1-70b-instruct',
  },
  {
    name: 'Claude 3 Opus',
    slug: 'claude-3-opus',
    provider: 'Anthropic',
    modelId: 'anthropic/claude-3-opus',
  },
  { name: 'GPT-4o Mini', slug: 'gpt-4o-mini', provider: 'OpenAI', modelId: 'openai/gpt-4o-mini' },
  {
    name: 'Mistral Large',
    slug: 'mistral-large',
    provider: 'Mistral AI',
    modelId: 'mistralai/mistral-large-latest',
  },
  {
    name: 'DeepSeek V2.5',
    slug: 'deepseek-v2-5',
    provider: 'DeepSeek',
    modelId: 'deepseek/deepseek-chat',
  },
]

const PROMPTS = [
  {
    title: 'Real Estate Website',
    slug: 'real-estate-website',
    level: 'beginner' as const,
    description: 'A real estate listing site with admin panel and property management',
    contentMd:
      'Create a real estate website with an admin area for uploading listings. Include property search with filters, image galleries, agent profiles, and a contact form. The site should have user authentication for saved searches and favorites.',
    expectedCategories: [
      'auth',
      'database',
      'orm',
      'hosting',
      'storage',
      'styling',
      'ui-components',
    ],
  },
  {
    title: 'SaaS Application',
    slug: 'saas-application',
    level: 'intermediate' as const,
    description: 'Full-featured SaaS starter with auth, billing, and team management',
    contentMd:
      'Build a SaaS application with user authentication, subscription billing, and a dashboard. Include team management, role-based access control, usage analytics, and email notifications for billing events.',
    expectedCategories: [
      'auth',
      'database',
      'orm',
      'payments',
      'email',
      'hosting',
      'analytics',
      'ui-components',
    ],
  },
  {
    title: 'Blog Platform with CMS',
    slug: 'blog-platform-cms',
    level: 'beginner' as const,
    description: 'Blogging platform with content management and newsletter',
    contentMd:
      'Create a blog platform with a CMS, comments, and email newsletter. Include rich text editing, category/tag management, SEO optimization, social sharing, and subscriber management with automated email digests.',
    expectedCategories: ['cms', 'database', 'orm', 'email', 'hosting', 'search', 'styling'],
  },
  {
    title: 'E-commerce Store',
    slug: 'ecommerce-store',
    level: 'intermediate' as const,
    description: 'Online store with catalog, cart, payments, and order management',
    contentMd:
      'Build an e-commerce store with product catalog, shopping cart, and payment processing. Include inventory management, order tracking, customer reviews, discount codes, and email order confirmations.',
    expectedCategories: [
      'payments',
      'database',
      'orm',
      'auth',
      'email',
      'storage',
      'hosting',
      'search',
    ],
  },
  {
    title: 'Project Management Tool',
    slug: 'project-management-tool',
    level: 'intermediate' as const,
    description: 'Kanban-style project management with real-time updates',
    contentMd:
      'Create a project management tool like Trello with real-time collaboration. Include boards, lists, cards, drag-and-drop, team workspaces, file attachments, activity logs, and due date notifications.',
    expectedCategories: [
      'realtime',
      'database',
      'orm',
      'auth',
      'storage',
      'hosting',
      'notifications',
      'state',
    ],
  },
  {
    title: 'Social Media Platform',
    slug: 'social-media-platform',
    level: 'advanced' as const,
    description: 'Social network with feed, messaging, and media sharing',
    contentMd:
      'Build a social media platform with user profiles, posts, likes, and comments. Include a news feed algorithm, image/video uploads, follow system, direct messaging, and push notifications.',
    expectedCategories: [
      'auth',
      'database',
      'orm',
      'storage',
      'realtime',
      'hosting',
      'notifications',
      'search',
    ],
  },
  {
    title: 'Job Board',
    slug: 'job-board',
    level: 'beginner' as const,
    description: 'Job listing site with company profiles and application management',
    contentMd:
      'Create a job board where companies post positions and applicants apply. Include company profiles, resume uploads, application tracking, email notifications, search with filters, and saved job listings.',
    expectedCategories: ['auth', 'database', 'orm', 'email', 'storage', 'hosting', 'search'],
  },
  {
    title: 'Restaurant Reservation System',
    slug: 'restaurant-reservation-system',
    level: 'beginner' as const,
    description: 'Reservation booking system with calendar and notifications',
    contentMd:
      'Build a restaurant reservation system with email confirmations. Include table management, availability calendar, waitlist, customer profiles, review system, and automated reminder emails.',
    expectedCategories: ['auth', 'database', 'orm', 'email', 'hosting', 'notifications'],
  },
  {
    title: 'Online Learning Platform',
    slug: 'online-learning-platform',
    level: 'intermediate' as const,
    description: 'E-learning platform with courses, quizzes, and progress tracking',
    contentMd:
      'Create an online learning platform with courses, quizzes, and certificates. Include video hosting, progress tracking, discussion forums, instructor dashboards, payment for premium courses, and completion certificates.',
    expectedCategories: ['auth', 'database', 'orm', 'payments', 'storage', 'hosting', 'email'],
  },
  {
    title: 'Multi-tenant CRM',
    slug: 'multi-tenant-crm',
    level: 'advanced' as const,
    description: 'Customer relationship management with multi-tenancy and email',
    contentMd:
      'Build a multi-tenant CRM with contact management and email integration. Include deal pipelines, task management, activity logging, email templates, team workspaces, reporting dashboards, and API integrations.',
    expectedCategories: ['auth', 'database', 'orm', 'email', 'hosting', 'analytics', 'api'],
  },
  {
    title: 'Weather Dashboard',
    slug: 'weather-dashboard',
    level: 'beginner' as const,
    description: 'Weather app with API integration and data visualization',
    contentMd:
      'Create a weather dashboard that pulls data from external APIs. Include current conditions, forecasts, interactive maps, location search, saved locations, weather alerts, and historical data charts.',
    expectedCategories: ['api', 'hosting', 'state', 'styling', 'ui-components'],
  },
  {
    title: 'Chat Application',
    slug: 'chat-application',
    level: 'intermediate' as const,
    description: 'Real-time messaging app with file sharing and group chats',
    contentMd:
      'Build a chat application with real-time messaging and file sharing. Include group chats, direct messages, typing indicators, read receipts, message search, emoji reactions, and push notifications.',
    expectedCategories: [
      'realtime',
      'auth',
      'database',
      'orm',
      'storage',
      'hosting',
      'notifications',
    ],
  },
  {
    title: 'Fitness Tracking App',
    slug: 'fitness-tracking-app',
    level: 'advanced' as const,
    description: 'Workout tracker with progress visualization and social features',
    contentMd:
      'Create a fitness tracking app with workout logging and progress charts. Include exercise library, custom workout plans, body measurements, goal setting, social challenges, and integration with wearable devices.',
    expectedCategories: [
      'auth',
      'database',
      'orm',
      'hosting',
      'analytics',
      'ui-components',
      'state',
    ],
  },
  {
    title: 'URL Shortener',
    slug: 'url-shortener',
    level: 'beginner' as const,
    description: 'Link shortener with click analytics and custom URLs',
    contentMd:
      'Build a URL shortener with analytics tracking. Include custom short URLs, click analytics with geographic data, link expiration, QR code generation, API access, and a dashboard showing link performance.',
    expectedCategories: ['database', 'orm', 'hosting', 'analytics', 'api'],
  },
  {
    title: 'Documentation Site',
    slug: 'documentation-site',
    level: 'beginner' as const,
    description: 'Technical documentation site with versioning and search',
    contentMd:
      'Create a documentation site with search, versioning, and dark mode. Include MDX content, API reference generation, code syntax highlighting, navigation sidebar, version selector, and full-text search.',
    expectedCategories: ['cms', 'search', 'hosting', 'styling', 'ui-components'],
  },
]

// ============================================================================
// SEED FUNCTIONS
// ============================================================================

async function createAuthUser(email: string): Promise<string | null> {
  const existing = await db.execute<{ id: string }>(sql`
    SELECT id FROM auth.users WHERE email = ${email}
  `)

  if (existing.length > 0) {
    console.log(`  Auth user ${email} already exists`)
    return existing[0]?.id ?? null
  }

  const newUsers = await db.execute<{ id: string }>(sql`
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud, confirmation_token, email_change,
      email_change_token_new, recovery_token, phone, phone_change,
      phone_change_token, email_change_token_current, reauthentication_token
    ) VALUES (
      gen_random_uuid(), '00000000-0000-0000-0000-000000000000', ${email}, '',
      now(), now(), now(), '{"provider": "email", "providers": ["email"]}',
      '{}', false, 'authenticated', 'authenticated', '', '', '', '', NULL, '', '', '', ''
    )
    RETURNING id
  `)

  const userId = newUsers[0]?.id
  if (!userId) return null

  await db.execute(sql`
    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      ${userId}::uuid, ${userId}::uuid, ${email}::varchar, 'email',
      jsonb_build_object('sub', ${userId}::text, 'email', ${email}::text, 'email_verified', true, 'provider', 'email'),
      now(), now(), now()
    )
  `)

  console.log(`  Created auth user ${email}`)
  return userId
}

async function seedAdminUsers() {
  console.log('Seeding admin users...')

  for (const seedUser of ADMIN_USERS) {
    const authId = await createAuthUser(seedUser.email)
    if (!authId) continue

    await db
      .insert(schema.userProfiles)
      .values({
        id: authId,
        email: seedUser.email,
        displayName: seedUser.displayName,
        role: 'admin',
      })
      .onConflictDoNothing()

    console.log(`  Profile for ${seedUser.email} ready`)
  }
}

async function seedCategoryGroups() {
  console.log('Seeding category groups...')
  await db.insert(schema.categories).values(CATEGORY_GROUPS).onConflictDoNothing()
  console.log(`  ${CATEGORY_GROUPS.length} category groups ready`)
}

async function seedSubcategories() {
  console.log('Seeding subcategories...')
  const allGroups = await db.select().from(schema.categories)
  const groupMap = new Map(allGroups.map((g) => [g.slug, g.id]))

  const values = SUBCATEGORIES.map((sub) => {
    const groupSlug = SUBCATEGORY_GROUP_MAP[sub.slug] ?? 'devtools'
    const categoryId = groupMap.get(groupSlug)
    if (!categoryId) {
      throw new Error(`Category group not found for slug: ${groupSlug}`)
    }
    return { ...sub, categoryId }
  })

  await db.insert(schema.subcategories).values(values).onConflictDoNothing()
  console.log(`  ${SUBCATEGORIES.length} subcategories ready`)
}

async function seedTools() {
  console.log('Seeding tools...')
  const toolValues = TOOLS.map((t) => ({
    name: t.name,
    slug: t.slug,
    description: t.description,
    website: t.website,
    logoUrl: t.logoUrl ?? null,
  }))
  await db.insert(schema.tools).values(toolValues).onConflictDoNothing()

  // Seed tool_aliases from TOOLS aliases arrays
  const allTools = await db
    .select({ id: schema.tools.id, slug: schema.tools.slug })
    .from(schema.tools)
  const toolSlugToId = new Map(allTools.map((t) => [t.slug, t.id]))

  const aliasValues = TOOLS.flatMap((t) => {
    const toolId = toolSlugToId.get(t.slug)
    if (!toolId || !t.aliases) return []
    return t.aliases.map((alias) => ({
      toolId,
      alias,
      normalizedAlias: alias.toLowerCase().trim(),
      source: 'seed',
    }))
  })

  if (aliasValues.length > 0) {
    await db.insert(schema.toolAliases).values(aliasValues).onConflictDoNothing()
  }

  console.log(`  ${TOOLS.length} tools ready`)
}

async function seedToolCategories() {
  console.log('Seeding tool-category assignments...')

  // Query back all subcategories and tools to get their IDs
  const allSubcategories = await db.select().from(schema.subcategories)
  const allTools = await db.select().from(schema.tools)
  const catMap = new Map(allSubcategories.map((c) => [c.slug, c.id]))
  const toolMap = new Map(allTools.map((t) => [t.slug, t.id]))

  let count = 0
  for (const assignment of TOOL_CATEGORY_ASSIGNMENTS) {
    const toolId = toolMap.get(assignment.toolSlug)
    const categoryId = catMap.get(assignment.categorySlug)
    if (!toolId || !categoryId) {
      console.warn(
        `  Skipping: tool=${assignment.toolSlug} category=${assignment.categorySlug} (not found)`,
      )
      continue
    }
    await db
      .insert(schema.toolCategories)
      .values({ toolId, categoryId, isPrimary: assignment.isPrimary })
      .onConflictDoNothing()
    count++
  }
  console.log(`  ${count} tool-category assignments ready`)
}

async function seedLlms() {
  console.log('Seeding LLMs...')
  await db.insert(schema.llms).values(LLMS).onConflictDoNothing()
  console.log(`  ${LLMS.length} LLMs ready`)
}

async function seedPrompts() {
  console.log('Seeding prompts...')
  await db.insert(schema.prompts).values(PROMPTS).onConflictDoNothing()
  console.log(`  ${PROMPTS.length} prompts ready`)
}

// Tool priority per category — first tool is most frequently recommended
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
  'ci-cd': ['github-actions', 'vercel-ci', 'circleci'],
  jobs: ['inngest', 'trigger-dev', 'bullmq', 'quirrel'],
  notifications: ['novu', 'onesignal'],
}

const MODEL_TIERS: Record<string, 'frontier' | 'mid' | 'small'> = {
  'claude-3-5-sonnet': 'frontier',
  'gpt-4o': 'frontier',
  'gemini-1-5-pro': 'frontier',
  'claude-3-opus': 'frontier',
  'mistral-large': 'frontier',
  'llama-3-1-70b': 'mid',
  'deepseek-v2-5': 'mid',
  'gpt-4o-mini': 'small',
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
    tier: MODEL_TIERS[llm.slug] ?? ('mid' as const),
    requestedModelId: llm.modelId,
    snapshotKey: `${llm.slug}-seed-v1`,
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

async function seed() {
  await seedAdminUsers()
  await seedCategoryGroups()
  await seedSubcategories()
  await seedTools()
  await seedToolCategories()
  await seedLlms()
  await seedPrompts()
  await seedBenchmarkData()
  await seedCritics()
  console.log('Seeding complete!')
}

seed()
  .catch((e) => {
    console.error('Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await conn.end()
  })
