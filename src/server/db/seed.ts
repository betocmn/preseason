/**
 * Database seed script for local development
 * Run with: pnpm db:seed
 *
 * Seeds admin users, categories, tools, LLMs, and prompts.
 * All operations are idempotent (safe to run multiple times).
 */

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

const ADMIN_USERS = [
  { email: 'beto@vinte.ai', displayName: 'Beto' },
  { email: 'elliott@vinte.ai', displayName: 'Elliott' },
]

const CATEGORIES = [
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
    name: 'Supabase Auth',
    slug: 'supabase-auth',
    website: 'https://supabase.com/auth',
    description: 'Open source auth with row-level security',
  },
  {
    name: 'Clerk',
    slug: 'clerk',
    website: 'https://clerk.com',
    description: 'Drop-in authentication and user management',
  },
  {
    name: 'Auth0',
    slug: 'auth0',
    website: 'https://auth0.com',
    description: 'Flexible authentication and authorization platform',
  },
  {
    name: 'NextAuth.js',
    slug: 'nextauth',
    website: 'https://next-auth.js.org',
    description: 'Authentication for Next.js',
    aliases: ['next-auth', 'Auth.js', 'authjs'],
  },
  {
    name: 'Firebase Auth',
    slug: 'firebase-auth',
    website: 'https://firebase.google.com/products/auth',
    description: 'Google-backed authentication service',
  },
  {
    name: 'Lucia',
    slug: 'lucia',
    website: 'https://lucia-auth.com',
    description: 'Lightweight auth library for TypeScript',
  },
  // Database
  {
    name: 'Supabase',
    slug: 'supabase',
    website: 'https://supabase.com',
    description: 'Open source Firebase alternative with Postgres',
  },
  {
    name: 'PlanetScale',
    slug: 'planetscale',
    website: 'https://planetscale.com',
    description: 'Serverless MySQL platform',
  },
  {
    name: 'Neon',
    slug: 'neon',
    website: 'https://neon.tech',
    description: 'Serverless Postgres with branching',
  },
  {
    name: 'Firebase',
    slug: 'firebase',
    website: 'https://firebase.google.com',
    description: 'Google app development platform with Firestore',
  },
  {
    name: 'MongoDB Atlas',
    slug: 'mongodb-atlas',
    website: 'https://www.mongodb.com/atlas',
    description: 'Cloud-hosted MongoDB service',
  },
  {
    name: 'Turso',
    slug: 'turso',
    website: 'https://turso.tech',
    description: 'Edge-hosted SQLite database',
  },
  // ORM
  {
    name: 'Prisma',
    slug: 'prisma',
    website: 'https://prisma.io',
    description: 'Next-generation Node.js and TypeScript ORM',
  },
  {
    name: 'Drizzle',
    slug: 'drizzle',
    website: 'https://orm.drizzle.team',
    description: 'TypeScript ORM with SQL-like syntax',
    aliases: ['drizzle-orm'],
  },
  {
    name: 'Kysely',
    slug: 'kysely',
    website: 'https://kysely.dev',
    description: 'Type-safe SQL query builder for TypeScript',
  },
  {
    name: 'TypeORM',
    slug: 'typeorm',
    website: 'https://typeorm.io',
    description: 'ORM for TypeScript and JavaScript',
  },
  // Email
  {
    name: 'Resend',
    slug: 'resend',
    website: 'https://resend.com',
    description: 'Email API for developers',
  },
  {
    name: 'SendGrid',
    slug: 'sendgrid',
    website: 'https://sendgrid.com',
    description: 'Email delivery and marketing platform',
  },
  {
    name: 'Postmark',
    slug: 'postmark',
    website: 'https://postmarkapp.com',
    description: 'Transactional email service',
  },
  {
    name: 'Amazon SES',
    slug: 'amazon-ses',
    website: 'https://aws.amazon.com/ses',
    description: 'AWS email sending service',
    aliases: ['SES', 'AWS SES'],
  },
  {
    name: 'Mailgun',
    slug: 'mailgun',
    website: 'https://www.mailgun.com',
    description: 'Email API service for developers',
  },
  // Payments
  {
    name: 'Stripe',
    slug: 'stripe',
    website: 'https://stripe.com',
    description: 'Payment infrastructure for the internet',
  },
  {
    name: 'Paddle',
    slug: 'paddle',
    website: 'https://paddle.com',
    description: 'Payment platform for SaaS',
  },
  {
    name: 'LemonSqueezy',
    slug: 'lemonsqueezy',
    website: 'https://lemonsqueezy.com',
    description: 'All-in-one payments for digital products',
    aliases: ['Lemon Squeezy'],
  },
  {
    name: 'PayPal',
    slug: 'paypal',
    website: 'https://developer.paypal.com',
    description: 'Online payment system',
  },
  // Storage
  {
    name: 'Supabase Storage',
    slug: 'supabase-storage',
    website: 'https://supabase.com/storage',
    description: 'S3-compatible object storage',
  },
  {
    name: 'Cloudinary',
    slug: 'cloudinary',
    website: 'https://cloudinary.com',
    description: 'Media management and optimization',
  },
  {
    name: 'UploadThing',
    slug: 'uploadthing',
    website: 'https://uploadthing.com',
    description: 'File uploads for full-stack TypeScript apps',
  },
  {
    name: 'AWS S3',
    slug: 'aws-s3',
    website: 'https://aws.amazon.com/s3',
    description: 'Amazon Simple Storage Service',
    aliases: ['S3', 'Amazon S3'],
  },
  {
    name: 'Cloudflare R2',
    slug: 'cloudflare-r2',
    website: 'https://developers.cloudflare.com/r2',
    description: 'S3-compatible object storage with zero egress',
  },
  // Hosting
  {
    name: 'Vercel',
    slug: 'vercel',
    website: 'https://vercel.com',
    description: 'Frontend deployment and serverless platform',
  },
  {
    name: 'Netlify',
    slug: 'netlify',
    website: 'https://netlify.com',
    description: 'Web development platform for modern sites',
  },
  {
    name: 'Railway',
    slug: 'railway',
    website: 'https://railway.app',
    description: 'Infrastructure platform for deployment',
  },
  {
    name: 'Fly.io',
    slug: 'fly-io',
    website: 'https://fly.io',
    description: 'Global application platform',
    aliases: ['Fly', 'flyio'],
  },
  {
    name: 'Render',
    slug: 'render',
    website: 'https://render.com',
    description: 'Cloud application hosting',
  },
  {
    name: 'Cloudflare Pages',
    slug: 'cloudflare-pages',
    website: 'https://pages.cloudflare.com',
    description: 'JAMstack platform by Cloudflare',
  },
  // Styling
  {
    name: 'Tailwind CSS',
    slug: 'tailwind-css',
    website: 'https://tailwindcss.com',
    description: 'Utility-first CSS framework',
    aliases: ['Tailwind', 'tailwindcss'],
  },
  {
    name: 'Bootstrap',
    slug: 'bootstrap',
    website: 'https://getbootstrap.com',
    description: 'Popular CSS framework',
  },
  {
    name: 'Panda CSS',
    slug: 'panda-css',
    website: 'https://panda-css.com',
    description: 'CSS-in-JS with build-time generation',
  },
  // UI Components
  {
    name: 'shadcn/ui',
    slug: 'shadcn-ui',
    website: 'https://ui.shadcn.com',
    description: 'Beautifully designed components built with Radix UI and Tailwind',
    aliases: ['shadcn', 'shadcnui'],
  },
  {
    name: 'Radix UI',
    slug: 'radix-ui',
    website: 'https://radix-ui.com',
    description: 'Unstyled, accessible UI primitives',
    aliases: ['Radix'],
  },
  {
    name: 'Chakra UI',
    slug: 'chakra-ui',
    website: 'https://chakra-ui.com',
    description: 'Simple, modular and accessible component library',
  },
  {
    name: 'MUI',
    slug: 'mui',
    website: 'https://mui.com',
    description: 'Material Design React components',
    aliases: ['Material UI', 'Material-UI'],
  },
  {
    name: 'Ant Design',
    slug: 'ant-design',
    website: 'https://ant.design',
    description: 'Enterprise-class UI design language',
    aliases: ['antd', 'AntDesign'],
  },
  {
    name: 'Mantine',
    slug: 'mantine',
    website: 'https://mantine.dev',
    description: 'Full-featured React component library',
  },
  // API
  {
    name: 'tRPC',
    slug: 'trpc',
    website: 'https://trpc.io',
    description: 'End-to-end typesafe APIs for TypeScript',
  },
  {
    name: 'Apollo GraphQL',
    slug: 'apollo-graphql',
    website: 'https://www.apollographql.com',
    description: 'GraphQL implementation for JavaScript',
    aliases: ['Apollo', 'GraphQL'],
  },
  {
    name: 'Hono',
    slug: 'hono',
    website: 'https://hono.dev',
    description: 'Small, fast web framework for the edge',
  },
  // Analytics
  {
    name: 'PostHog',
    slug: 'posthog',
    website: 'https://posthog.com',
    description: 'Open source product analytics',
  },
  {
    name: 'Plausible',
    slug: 'plausible',
    website: 'https://plausible.io',
    description: 'Privacy-friendly web analytics',
  },
  {
    name: 'Mixpanel',
    slug: 'mixpanel',
    website: 'https://mixpanel.com',
    description: 'Product analytics for user behavior',
  },
  {
    name: 'Google Analytics',
    slug: 'google-analytics',
    website: 'https://analytics.google.com',
    description: 'Web analytics service by Google',
    aliases: ['GA', 'GA4'],
  },
  // Monitoring
  {
    name: 'Sentry',
    slug: 'sentry',
    website: 'https://sentry.io',
    description: 'Application monitoring and error tracking',
  },
  {
    name: 'LogRocket',
    slug: 'logrocket',
    website: 'https://logrocket.com',
    description: 'Session replay and error tracking',
  },
  {
    name: 'Datadog',
    slug: 'datadog',
    website: 'https://datadoghq.com',
    description: 'Cloud monitoring and observability',
  },
  // AI
  {
    name: 'OpenAI',
    slug: 'openai',
    website: 'https://openai.com',
    description: 'AI models including GPT and DALL-E',
    aliases: ['GPT', 'ChatGPT'],
  },
  {
    name: 'Anthropic',
    slug: 'anthropic',
    website: 'https://anthropic.com',
    description: 'AI safety company building Claude',
    aliases: ['Claude'],
  },
  {
    name: 'Replicate',
    slug: 'replicate',
    website: 'https://replicate.com',
    description: 'Run AI models via API',
  },
  {
    name: 'Hugging Face',
    slug: 'hugging-face',
    website: 'https://huggingface.co',
    description: 'Open source AI model hub',
    aliases: ['HuggingFace'],
  },
  // Realtime
  {
    name: 'Pusher',
    slug: 'pusher',
    website: 'https://pusher.com',
    description: 'Realtime messaging and event infrastructure',
  },
  {
    name: 'Ably',
    slug: 'ably',
    website: 'https://ably.com',
    description: 'Realtime messaging platform',
  },
  {
    name: 'Supabase Realtime',
    slug: 'supabase-realtime',
    website: 'https://supabase.com/realtime',
    description: 'Realtime Postgres changes over WebSocket',
  },
  {
    name: 'Socket.io',
    slug: 'socket-io',
    website: 'https://socket.io',
    description: 'Bidirectional event-based communication',
    aliases: ['SocketIO', 'socket.io'],
  },
  // Search
  {
    name: 'Algolia',
    slug: 'algolia',
    website: 'https://algolia.com',
    description: 'AI-powered search and discovery',
  },
  {
    name: 'Typesense',
    slug: 'typesense',
    website: 'https://typesense.org',
    description: 'Open source search engine',
  },
  {
    name: 'Meilisearch',
    slug: 'meilisearch',
    website: 'https://meilisearch.com',
    description: 'Lightning-fast open source search engine',
  },
  {
    name: 'Elasticsearch',
    slug: 'elasticsearch',
    website: 'https://elastic.co',
    description: 'Distributed search and analytics engine',
  },
  // Testing
  {
    name: 'Vitest',
    slug: 'vitest',
    website: 'https://vitest.dev',
    description: 'Vite-native unit testing framework',
  },
  {
    name: 'Jest',
    slug: 'jest',
    website: 'https://jestjs.io',
    description: 'JavaScript testing framework',
  },
  {
    name: 'Playwright',
    slug: 'playwright',
    website: 'https://playwright.dev',
    description: 'End-to-end testing framework',
  },
  {
    name: 'Cypress',
    slug: 'cypress',
    website: 'https://cypress.io',
    description: 'End-to-end testing for web apps',
  },
  // CI/CD
  {
    name: 'GitHub Actions',
    slug: 'github-actions',
    website: 'https://github.com/features/actions',
    description: 'CI/CD built into GitHub',
  },
  {
    name: 'Vercel CI',
    slug: 'vercel-ci',
    website: 'https://vercel.com',
    description: 'Continuous deployment via Vercel',
  },
  {
    name: 'CircleCI',
    slug: 'circleci',
    website: 'https://circleci.com',
    description: 'Continuous integration and delivery platform',
  },
  // Jobs
  {
    name: 'Inngest',
    slug: 'inngest',
    website: 'https://inngest.com',
    description: 'Durable functions and event-driven workflows',
  },
  {
    name: 'Trigger.dev',
    slug: 'trigger-dev',
    website: 'https://trigger.dev',
    description: 'Background jobs for TypeScript',
    aliases: ['Trigger', 'triggerdev'],
  },
  {
    name: 'BullMQ',
    slug: 'bullmq',
    website: 'https://bullmq.io',
    description: 'Node.js message queue based on Redis',
  },
  {
    name: 'Quirrel',
    slug: 'quirrel',
    website: 'https://quirrel.dev',
    description: 'Job queueing for serverless',
  },
  // CMS
  {
    name: 'Sanity',
    slug: 'sanity',
    website: 'https://sanity.io',
    description: 'Structured content platform',
  },
  {
    name: 'Contentful',
    slug: 'contentful',
    website: 'https://contentful.com',
    description: 'Headless content management',
  },
  {
    name: 'Strapi',
    slug: 'strapi',
    website: 'https://strapi.io',
    description: 'Open source headless CMS',
  },
  {
    name: 'Payload CMS',
    slug: 'payload-cms',
    website: 'https://payloadcms.com',
    description: 'TypeScript-first headless CMS',
    aliases: ['Payload'],
  },
  // Notifications
  {
    name: 'Novu',
    slug: 'novu',
    website: 'https://novu.co',
    description: 'Open source notification infrastructure',
  },
  {
    name: 'OneSignal',
    slug: 'onesignal',
    website: 'https://onesignal.com',
    description: 'Push notification service',
  },
  {
    name: 'Firebase Cloud Messaging',
    slug: 'firebase-cloud-messaging',
    website: 'https://firebase.google.com/products/cloud-messaging',
    description: 'Cross-platform messaging by Google',
    aliases: ['FCM'],
  },
]

// Map tool slugs to their category slugs (with isPrimary flag)
const TOOL_CATEGORY_ASSIGNMENTS: Array<{
  toolSlug: string
  categorySlug: string
  isPrimary: boolean
}> = [
  // Auth
  { toolSlug: 'supabase-auth', categorySlug: 'auth', isPrimary: true },
  { toolSlug: 'clerk', categorySlug: 'auth', isPrimary: true },
  { toolSlug: 'auth0', categorySlug: 'auth', isPrimary: true },
  { toolSlug: 'nextauth', categorySlug: 'auth', isPrimary: true },
  { toolSlug: 'firebase-auth', categorySlug: 'auth', isPrimary: true },
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
  { toolSlug: 'supabase-storage', categorySlug: 'storage', isPrimary: true },
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
  { toolSlug: 'supabase-realtime', categorySlug: 'realtime', isPrimary: true },
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
  { toolSlug: 'firebase-cloud-messaging', categorySlug: 'notifications', isPrimary: true },
  // Cross-category assignments (tools that span multiple categories)
  { toolSlug: 'supabase', categorySlug: 'auth', isPrimary: false },
  { toolSlug: 'supabase', categorySlug: 'storage', isPrimary: false },
  { toolSlug: 'supabase', categorySlug: 'realtime', isPrimary: false },
  { toolSlug: 'firebase', categorySlug: 'auth', isPrimary: false },
  { toolSlug: 'firebase', categorySlug: 'storage', isPrimary: false },
  { toolSlug: 'firebase', categorySlug: 'realtime', isPrimary: false },
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
    level: 'vibe-coder' as const,
    description: 'A real estate listing site with admin panel and property management',
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
    level: 'vibe-coder' as const,
    description: 'Full-featured SaaS starter with auth, billing, and team management',
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
    level: 'vibe-coder' as const,
    description: 'Blogging platform with content management and newsletter',
    expectedCategories: ['cms', 'database', 'orm', 'email', 'hosting', 'search', 'styling'],
  },
  {
    title: 'E-commerce Store',
    slug: 'ecommerce-store',
    level: 'vibe-coder' as const,
    description: 'Online store with catalog, cart, payments, and order management',
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
    level: 'vibe-coder' as const,
    description: 'Kanban-style project management with real-time updates',
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
    level: 'vibe-coder' as const,
    description: 'Social network with feed, messaging, and media sharing',
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
    level: 'vibe-coder' as const,
    description: 'Job listing site with company profiles and application management',
    expectedCategories: ['auth', 'database', 'orm', 'email', 'storage', 'hosting', 'search'],
  },
  {
    title: 'Restaurant Reservation System',
    slug: 'restaurant-reservation-system',
    level: 'vibe-coder' as const,
    description: 'Reservation booking system with calendar and notifications',
    expectedCategories: ['auth', 'database', 'orm', 'email', 'hosting', 'notifications'],
  },
  {
    title: 'Online Learning Platform',
    slug: 'online-learning-platform',
    level: 'vibe-coder' as const,
    description: 'E-learning platform with courses, quizzes, and progress tracking',
    expectedCategories: ['auth', 'database', 'orm', 'payments', 'storage', 'hosting', 'email'],
  },
  {
    title: 'Multi-tenant CRM',
    slug: 'multi-tenant-crm',
    level: 'vibe-coder' as const,
    description: 'Customer relationship management with multi-tenancy and email',
    expectedCategories: ['auth', 'database', 'orm', 'email', 'hosting', 'analytics', 'api'],
  },
  {
    title: 'Weather Dashboard',
    slug: 'weather-dashboard',
    level: 'vibe-coder' as const,
    description: 'Weather app with API integration and data visualization',
    expectedCategories: ['api', 'hosting', 'state', 'styling', 'ui-components'],
  },
  {
    title: 'Chat Application',
    slug: 'chat-application',
    level: 'vibe-coder' as const,
    description: 'Real-time messaging app with file sharing and group chats',
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
    level: 'vibe-coder' as const,
    description: 'Workout tracker with progress visualization and social features',
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
    level: 'vibe-coder' as const,
    description: 'Link shortener with click analytics and custom URLs',
    expectedCategories: ['database', 'orm', 'hosting', 'analytics', 'api'],
  },
  {
    title: 'Documentation Site',
    slug: 'documentation-site',
    level: 'vibe-coder' as const,
    description: 'Technical documentation site with versioning and search',
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

async function seedCategories() {
  console.log('Seeding categories...')
  await db.insert(schema.categories).values(CATEGORIES).onConflictDoNothing()
  console.log(`  ${CATEGORIES.length} categories ready`)
}

async function seedTools() {
  console.log('Seeding tools...')
  // Insert tools without aliases first, then with - onConflictDoNothing handles idempotency
  const toolValues = TOOLS.map((t) => ({
    name: t.name,
    slug: t.slug,
    description: t.description,
    website: t.website,
    aliases: t.aliases ?? null,
  }))
  await db.insert(schema.tools).values(toolValues).onConflictDoNothing()
  console.log(`  ${TOOLS.length} tools ready`)
}

async function seedToolCategories() {
  console.log('Seeding tool-category assignments...')

  // Query back all categories and tools to get their IDs
  const allCategories = await db.select().from(schema.categories)
  const allTools = await db.select().from(schema.tools)
  const catMap = new Map(allCategories.map((c) => [c.slug, c.id]))
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

// ============================================================================
// MAIN
// ============================================================================

async function seed() {
  await seedAdminUsers()
  await seedCategories()
  await seedTools()
  await seedToolCategories()
  await seedLlms()
  await seedPrompts()
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
