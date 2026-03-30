import type { PromptLevel } from '~/server/llm/prompts'

type PromptVariant = {
  description: string
  contentMd: string
}

type PromptScenario = {
  title: string
  slug: string
  expectedCategories: string[]
  variants: Record<PromptLevel, PromptVariant>
}

export type SeedPrompt = {
  title: string
  slug: string
  level: PromptLevel
  description: string
  contentMd: string
  expectedCategories: string[]
  isActive: true
}

export const PROMPT_LEVELS: PromptLevel[] = ['beginner', 'intermediate', 'advanced']

const PROMPT_SCENARIOS: PromptScenario[] = [
  {
    title: 'Real Estate Website',
    slug: 'real-estate-website',
    expectedCategories: [
      'auth',
      'database',
      'orm',
      'hosting',
      'storage',
      'styling',
      'ui-components',
    ],
    variants: {
      beginner: {
        description: 'Real estate listing site with search, agent profiles, and saved homes',
        contentMd:
          'Create a real estate website where people can browse property listings, filter by price and location, look through photo galleries, read agent profiles, contact an agent, and save favorite homes for later.',
      },
      intermediate: {
        description:
          'Property marketplace with agent and buyer accounts, listing management, and lead workflows',
        contentMd:
          'Build a real estate platform with public listing pages plus authenticated buyer and agent accounts. Buyers should be able to save searches, favorite listings, request showings, and manage inquiries. Agents should be able to create and update listings, upload property media, and review incoming leads. Include structured property data, search filters, pagination, and an admin workflow for moderating listings and flagging incomplete submissions.',
      },
      advanced: {
        description:
          'Production-ready property platform with role separation, moderation, and operational safeguards',
        contentMd:
          'Build a production-ready real estate platform with separate buyer, agent, and admin roles. Support listing creation, media upload, saved searches, lead routing, and showing requests while enforcing role-based access control and auditability for listing changes. Define data boundaries for listings, property media, saved searches, and inquiries. Include moderation tooling, rate limiting for public contact forms, failure handling for media processing, observability for lead delivery, and a deployment approach that supports schema changes without breaking active listings.',
      },
    },
  },
  {
    title: 'SaaS Application',
    slug: 'saas-application',
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
    variants: {
      beginner: {
        description: 'Subscription SaaS app with login, billing, and a customer dashboard',
        contentMd:
          'Build a SaaS application with user login, subscription billing, and a dashboard for customers. Include account settings, a simple team area, usage tracking, billing emails, and a clean interface for managing the product.',
      },
      intermediate: {
        description:
          'Multi-user SaaS starter with subscriptions, seat management, and usage reporting',
        contentMd:
          'Build a SaaS product with individual and team accounts, subscription billing, a customer dashboard, and role-aware access for account owners and members. Support seat management, plan upgrades and downgrades, usage reporting, billing event emails, and a basic admin area for account review. Include data persistence for users, workspaces, subscriptions, invoices, and usage events, plus webhook handling for billing updates and deployment expectations suitable for a public launch.',
      },
      advanced: {
        description:
          'Production SaaS platform with tenancy boundaries, billing correctness, and operational visibility',
        contentMd:
          'Build a production-grade SaaS platform with multi-tenant account isolation, subscription billing, seat-based access, and detailed usage metering. Define clear data models for users, workspaces, entitlements, subscriptions, invoices, and usage events. Enforce role-based permissions across account management and administrative workflows. Include idempotent billing event processing, audit trails for permission and plan changes, observability for checkout and renewal failures, graceful handling of delinquent accounts, and a migration strategy for evolving pricing and entitlement rules without corrupting historical billing state.',
      },
    },
  },
  {
    title: 'Blog Platform with CMS',
    slug: 'blog-platform-cms',
    expectedCategories: ['cms', 'database', 'orm', 'email', 'hosting', 'search', 'styling'],
    variants: {
      beginner: {
        description: 'Publishing platform with blog posts, categories, comments, and a newsletter',
        contentMd:
          'Create a blog platform with a simple CMS so writers can publish articles, organize them by category, and send a newsletter. Include comments, search, social sharing, and a polished reading experience.',
      },
      intermediate: {
        description:
          'Editorial publishing system with drafts, scheduled posts, and subscriber management',
        contentMd:
          'Build a blog and publishing platform with an authoring CMS, draft and scheduled publishing, comments, category and tag management, subscriber signups, and newsletter digests. Writers and editors should be able to collaborate through a back office workflow. Include structured content storage, search across published content, preview support, email capture, and moderation tools for comments and subscriber issues.',
      },
      advanced: {
        description:
          'Editorial CMS with review workflows, content governance, and search reliability',
        contentMd:
          'Build a production-ready editorial platform with separate writer, editor, and admin permissions. Support rich article authoring, content previews, scheduled publishing, comment moderation, subscriber lifecycle management, and search across published content. Model revisions, publication states, taxonomy, comments, and subscriber data explicitly. Include audit logs for content changes, resilient scheduling and email delivery, rollback support for publishing mistakes, observability for indexing and newsletter jobs, and security controls that protect unpublished drafts and subscriber data.',
      },
    },
  },
  {
    title: 'E-commerce Store',
    slug: 'ecommerce-store',
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
    variants: {
      beginner: {
        description: 'Online store with products, cart, checkout, and order confirmations',
        contentMd:
          'Build an online store with a product catalog, shopping cart, checkout, and order confirmation emails. Include customer accounts, product search, product images, reviews, and order history.',
      },
      intermediate: {
        description: 'Commerce storefront with inventory, customer accounts, and order operations',
        contentMd:
          'Build an e-commerce store with customer authentication, product catalog management, search and filtering, shopping cart, checkout, order history, reviews, and inventory tracking. Support product media uploads, discount codes, transactional emails, and an operations workflow for managing orders, returns, and stock adjustments. Include structured data for customers, products, inventory, carts, orders, payments, and promotions.',
      },
      advanced: {
        description:
          'Production commerce system with inventory integrity, fulfillment workflows, and failure handling',
        contentMd:
          'Build a production-grade commerce platform with customer accounts, product catalog management, checkout, order processing, inventory tracking, and discounting. Model products, variants, stock movements, carts, orders, payments, refunds, and fulfillment states explicitly. Enforce role-based separation between shoppers, support agents, and operations staff. Include idempotent order and payment handling, safeguards against overselling, observability for checkout and fulfillment failures, audit logs for price and inventory changes, secure handling of customer and payment-adjacent data, and a rollout strategy for schema changes that preserves historical order records.',
      },
    },
  },
  {
    title: 'Project Management Tool',
    slug: 'project-management-tool',
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
    variants: {
      beginner: {
        description: 'Kanban-style planning app with boards, cards, due dates, and team activity',
        contentMd:
          'Create a project management tool where teams can organize work on boards with lists and cards. Include due dates, file attachments, activity history, team collaboration, and a responsive interface.',
      },
      intermediate: {
        description:
          'Team workflow app with shared boards, card activity, and collaborative updates',
        contentMd:
          'Build a project management application with authenticated workspaces, boards, lists, cards, comments, file attachments, due dates, and team notifications. Support drag-and-drop updates, shared project views, activity history, and near real-time collaboration so multiple teammates can work in the same board. Include data persistence for workspaces, memberships, board structure, tasks, comments, files, and notifications.',
      },
      advanced: {
        description:
          'Collaborative planning platform with concurrency, permissions, and event durability',
        contentMd:
          'Build a production-ready project management platform with workspace isolation, board and task permissions, real-time collaborative updates, attachments, comments, and notification workflows. Define data models for memberships, projects, boards, lists, tasks, comments, attachments, and activity events. Address optimistic and server-authoritative updates for concurrent edits, auditability for task and permission changes, durable event processing for notifications, observability for sync failures, and resilience when attachment uploads or background processing jobs fail.',
      },
    },
  },
  {
    title: 'Social Media Platform',
    slug: 'social-media-platform',
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
    variants: {
      beginner: {
        description: 'Social app with profiles, posts, comments, likes, and direct messages',
        contentMd:
          'Build a social media platform where users can create profiles, share posts, like and comment on content, follow other people, send messages, and upload photos or videos.',
      },
      intermediate: {
        description: 'Community platform with feeds, messaging, moderation, and media sharing',
        contentMd:
          'Build a social platform with user accounts, follow relationships, content feeds, comments, reactions, direct messaging, and media uploads. Include profile management, search, notifications, and moderation workflows for reported content. Support persistence for users, social graph relationships, posts, comments, reactions, conversations, and media assets, with product expectations suitable for a growing public app.',
      },
      advanced: {
        description:
          'High-scale social network with moderation, feed integrity, and delivery observability',
        contentMd:
          'Build a production-grade social platform with user profiles, following, content creation, comments, reactions, messaging, media uploads, search, and moderation. Define clear boundaries for identity, social graph, content, messaging, notifications, and media processing. Include role-based moderation tools, abuse-report handling, rate limits and anti-spam controls, resilient processing for feed fan-out and media transformation, observability for notification and delivery pipelines, privacy controls for account visibility, and a strategy for scaling read-heavy feeds without losing auditability or safety controls.',
      },
    },
  },
  {
    title: 'Job Board',
    slug: 'job-board',
    expectedCategories: ['auth', 'database', 'orm', 'email', 'storage', 'hosting', 'search'],
    variants: {
      beginner: {
        description:
          'Hiring marketplace with job listings, company pages, and candidate applications',
        contentMd:
          'Create a job board where companies can publish openings and job seekers can browse roles, search by filters, upload resumes, save jobs, and apply online. Include company profiles and email updates.',
      },
      intermediate: {
        description:
          'Recruiting platform with employer workflows, applicant tracking, and search filters',
        contentMd:
          'Build a job board with separate employer and candidate accounts. Employers should be able to create company profiles, publish listings, review applicants, and update hiring stages. Candidates should be able to search and filter roles, save jobs, upload resumes, and submit applications. Include email notifications, structured application data, search support, and an administrative workflow for moderating listings.',
      },
      advanced: {
        description:
          'Recruiting marketplace with role boundaries, application auditability, and data protection',
        contentMd:
          'Build a production-ready recruiting platform with employer accounts, candidate accounts, company profiles, job listings, search, application tracking, and resume handling. Model listings, candidate profiles, resumes, applications, hiring stages, and notifications explicitly. Enforce role-based access between employers, candidates, and admins. Include audit trails for hiring-stage changes, secure storage and access rules for resume data, observability for application and email delivery failures, safeguards against duplicate or lost submissions, and moderation controls for fraudulent listings and spam applicants.',
      },
    },
  },
  {
    title: 'Restaurant Reservation System',
    slug: 'restaurant-reservation-system',
    expectedCategories: ['auth', 'database', 'orm', 'email', 'hosting', 'notifications'],
    variants: {
      beginner: {
        description:
          'Reservation booking app with table availability, reminders, and guest profiles',
        contentMd:
          'Build a restaurant reservation system where guests can book tables, receive confirmations, manage upcoming reservations, join a waitlist, and get reminder messages. Include staff views for table availability.',
      },
      intermediate: {
        description:
          'Hospitality booking system with staff scheduling, waitlists, and guest communication',
        contentMd:
          'Build a reservation platform for restaurants with guest accounts, table availability, booking flows, waitlist management, reminder messages, and a staff dashboard for managing service windows. Support customer profiles, reservation edits and cancellations, automated confirmations, and an operations workflow for assigning tables and handling no-shows. Include structured data for guests, reservations, seating inventory, service periods, and notifications.',
      },
      advanced: {
        description:
          'Reservation platform with booking integrity, staff controls, and operational resilience',
        contentMd:
          'Build a production-ready restaurant reservation platform with guest booking, waitlists, staff scheduling views, and communications around confirmations, reminders, and cancellations. Define explicit data models for guests, reservations, seating inventory, service windows, waitlist entries, and communication events. Enforce role-based access for hosts, managers, and administrators. Include safeguards against double-booking, reliable promotion of waitlisted guests, observability for confirmation and reminder delivery, audit logs for staff reservation overrides, and recovery behavior when notification or scheduling jobs fail.',
      },
    },
  },
  {
    title: 'Online Learning Platform',
    slug: 'online-learning-platform',
    expectedCategories: ['auth', 'database', 'orm', 'payments', 'storage', 'hosting', 'email'],
    variants: {
      beginner: {
        description: 'Course platform with video lessons, quizzes, certificates, and paid access',
        contentMd:
          'Create an online learning platform with student accounts, video lessons, quizzes, course progress, certificates, and paid premium courses. Include instructor profiles and email updates.',
      },
      intermediate: {
        description:
          'Education platform with course delivery, progress tracking, and instructor workflows',
        contentMd:
          'Build an e-learning platform with student and instructor accounts, course publishing, lessons, quizzes, progress tracking, certificates, and premium course payments. Support media uploads for lesson content, instructor dashboards, student enrollment, and email communication for account and course events. Include structured persistence for courses, modules, lessons, enrollments, quiz results, certificates, and payments.',
      },
      advanced: {
        description:
          'Learning platform with entitlements, completion correctness, and media delivery safeguards',
        contentMd:
          'Build a production-grade learning platform with instructor publishing workflows, student enrollment, paid access, video and document delivery, quizzes, certificates, and progress tracking. Define explicit models for course content, enrollments, entitlements, assessments, completion state, and certificates. Enforce role-based controls for students, instructors, and administrators. Include observability for media delivery and payment failures, secure access to premium content, idempotent certificate issuance, auditability for grading and content changes, and a migration plan for evolving course structures without breaking learner progress.',
      },
    },
  },
  {
    title: 'Multi-tenant CRM',
    slug: 'multi-tenant-crm',
    expectedCategories: ['auth', 'database', 'orm', 'email', 'hosting', 'analytics', 'api'],
    variants: {
      beginner: {
        description: 'Customer relationship app with contacts, deals, tasks, and team dashboards',
        contentMd:
          'Build a CRM where teams can manage contacts, companies, deals, notes, tasks, and activity history. Include email reminders, team dashboards, and a simple way to view pipeline progress.',
      },
      intermediate: {
        description:
          'Tenant-aware CRM with shared pipelines, reporting, and outbound communication workflows',
        contentMd:
          'Build a CRM for business teams with workspace-based accounts, contacts, companies, deal pipelines, tasks, notes, and reporting dashboards. Support team memberships, role-aware access, email templates, activity logging, and external integrations through an API. Include structured data for tenants, contacts, companies, deals, tasks, activities, outbound messages, and reports.',
      },
      advanced: {
        description:
          'Production CRM with tenant isolation, audit trails, and integration reliability',
        contentMd:
          'Build a production-ready multi-tenant CRM with strict tenant isolation, team memberships, role-based permissions, contacts, companies, pipelines, tasks, activity history, email workflows, reporting, and external API access. Define data boundaries for tenant-scoped records, integration credentials, event logs, and reporting aggregates. Include audit logs for record and permission changes, resilient processing for outbound email and integration jobs, observability for sync failures, rate limiting and access controls for public APIs, and a schema evolution strategy that preserves tenant data integrity and historical analytics.',
      },
    },
  },
  {
    title: 'Weather Dashboard',
    slug: 'weather-dashboard',
    expectedCategories: ['api', 'hosting', 'state', 'styling', 'ui-components'],
    variants: {
      beginner: {
        description:
          'Forecast dashboard with saved locations, alerts, and visual weather summaries',
        contentMd:
          'Create a weather dashboard that shows current conditions, forecasts, maps, saved locations, weather alerts, and easy-to-read charts for recent weather trends.',
      },
      intermediate: {
        description:
          'Data-driven forecast app with cached API data and personalized location views',
        contentMd:
          'Build a weather application that fetches external forecast data, stores user preferences for saved locations, and presents current conditions, multi-day forecasts, alerts, and historical charts. Include a searchable location picker, responsive dashboard views, and state management for loading, stale data, and refresh behavior. Define how external API data is fetched, cached, and surfaced to users.',
      },
      advanced: {
        description:
          'Forecast platform with external API resilience, cache strategy, and alert delivery observability',
        contentMd:
          'Build a production-ready weather dashboard that consumes third-party forecast data, supports saved locations, alerts, historical visualizations, and responsive dashboards. Model user preferences, location metadata, forecast snapshots, and alert subscriptions explicitly. Handle external API rate limits, stale or partial forecast data, cache invalidation, and failure recovery when providers are unavailable. Include observability for upstream fetch failures, controlled refresh behavior, and safeguards so users still see a coherent experience when weather data is delayed or incomplete.',
      },
    },
  },
  {
    title: 'Chat Application',
    slug: 'chat-application',
    expectedCategories: [
      'realtime',
      'auth',
      'database',
      'orm',
      'storage',
      'hosting',
      'notifications',
    ],
    variants: {
      beginner: {
        description:
          'Messaging app with direct chats, group rooms, file sharing, and notifications',
        contentMd:
          'Build a chat application with direct messages, group conversations, typing indicators, read receipts, file sharing, message search, and notifications for new activity.',
      },
      intermediate: {
        description:
          'Realtime messaging product with room management, search, and attachment workflows',
        contentMd:
          'Build a messaging app with authenticated users, direct conversations, group rooms, typing indicators, read receipts, attachments, search, and push-style notifications. Support room membership management, message history, file uploads, and responsive client state for live updates. Include structured persistence for users, rooms, memberships, messages, read state, attachments, and notifications.',
      },
      advanced: {
        description:
          'Realtime communication system with delivery guarantees, permissions, and operational visibility',
        contentMd:
          'Build a production-ready chat platform with direct and group messaging, room permissions, message history, attachments, notifications, and presence indicators. Define explicit models for users, rooms, memberships, messages, attachments, delivery state, and read state. Handle concurrent message delivery, reconnect behavior, offline state recovery, and safe attachment access. Include observability for realtime delivery failures, anti-abuse controls, auditability for moderation actions, and resilience when notification or media services degrade.',
      },
    },
  },
  {
    title: 'Fitness Tracking App',
    slug: 'fitness-tracking-app',
    expectedCategories: [
      'auth',
      'database',
      'orm',
      'hosting',
      'analytics',
      'ui-components',
      'state',
    ],
    variants: {
      beginner: {
        description: 'Workout tracker with goals, progress charts, and social fitness challenges',
        contentMd:
          'Create a fitness tracking app where users can log workouts, track goals, follow progress charts, save exercise routines, and join social challenges with friends.',
      },
      intermediate: {
        description: 'Health and workout product with plans, measurements, and progress analytics',
        contentMd:
          'Build a fitness platform with user accounts, workout logging, exercise libraries, custom plans, progress dashboards, measurements, goal tracking, and social challenges. Support persistent history for workouts and body metrics, plus stateful dashboards that summarize trends over time. Include coach or admin workflows for reviewing shared plans and featured challenges.',
      },
      advanced: {
        description:
          'Fitness platform with sensitive-user data handling, analytics correctness, and event durability',
        contentMd:
          'Build a production-grade fitness platform with workout tracking, exercise libraries, plans, progress analytics, social challenges, and user-specific goals. Define clear models for workout events, plans, measurements, achievements, and challenge participation. Treat body metrics and health-adjacent data as sensitive user information with strict access rules. Include observability for analytics pipelines, auditability for plan and challenge changes, resilient processing for delayed event ingestion, and careful handling of derived metrics so charts and progress summaries remain consistent as historical workout data changes.',
      },
    },
  },
  {
    title: 'URL Shortener',
    slug: 'url-shortener',
    expectedCategories: ['database', 'orm', 'hosting', 'analytics', 'api'],
    variants: {
      beginner: {
        description: 'Link shortener with custom aliases, click stats, and simple dashboards',
        contentMd:
          'Build a URL shortener where users can create short links, choose custom aliases, track click counts, view simple analytics, and manage their links from a dashboard.',
      },
      intermediate: {
        description: 'Link management service with analytics, expiration rules, and API access',
        contentMd:
          'Build a link shortener with authenticated user accounts, custom aliases, expiration rules, click analytics, QR code support, dashboard views, and an API for managing links. Include structured data for users, links, redirect events, analytics summaries, and API credentials. Support link editing, archiving, and team-friendly management workflows.',
      },
      advanced: {
        description:
          'Redirect platform with analytics pipelines, abuse controls, and high-availability routing',
        contentMd:
          'Build a production-ready URL shortener with user accounts, custom aliases, redirect handling, click analytics, expiration policies, and API access. Model short links, redirect targets, click events, rate limits, and API credentials explicitly. Include abuse prevention for malicious links, resilient redirect behavior under heavy read traffic, observability for redirect latency and analytics lag, audit logs for destructive link changes, and a design that separates hot redirect paths from slower analytics aggregation so link resolution stays reliable.',
      },
    },
  },
  {
    title: 'Documentation Site',
    slug: 'documentation-site',
    expectedCategories: ['cms', 'search', 'hosting', 'styling', 'ui-components'],
    variants: {
      beginner: {
        description:
          'Developer docs site with navigation, search, versioning, and readable content',
        contentMd:
          'Create a documentation site with article navigation, full-text search, code examples, versioned docs, and a clean reading experience for technical content.',
      },
      intermediate: {
        description:
          'Docs platform with structured content, search indexing, and version publishing workflows',
        contentMd:
          'Build a documentation platform that supports versioned content, structured navigation, search, syntax-highlighted code samples, and publishing workflows for technical teams. Include a content management flow for drafts and releases, API reference pages, and a responsive reading experience. Define how documentation content is authored, stored, versioned, and published.',
      },
      advanced: {
        description:
          'Documentation platform with content governance, search quality, and safe version rollouts',
        contentMd:
          'Build a production-ready documentation platform with versioned technical content, search, navigation, API reference pages, and content publishing workflows. Model versions, navigation trees, content revisions, and search indexes explicitly. Include editorial access controls, preview support, audit logs for content changes, observability for build and indexing failures, and rollback mechanisms for bad releases so broken documentation updates can be reversed without disrupting older stable versions.',
      },
    },
  },
]

export const PROMPT_SLUGS = PROMPT_SCENARIOS.map((scenario) => scenario.slug)

export const PROMPT_CORPUS: SeedPrompt[] = PROMPT_SCENARIOS.flatMap((scenario) =>
  PROMPT_LEVELS.map((level) => ({
    title: scenario.title,
    slug: scenario.slug,
    level,
    description: scenario.variants[level].description,
    contentMd: scenario.variants[level].contentMd,
    expectedCategories: [...scenario.expectedCategories],
    isActive: true,
  })),
)
