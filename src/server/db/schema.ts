import { relations, sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTableCreator,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * Multi-project schema prefix for Preseason
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `preseason_${name}`)

// ============================================================================
// ENUMS
// ============================================================================

export const userRoleEnum = pgEnum('user_role', ['admin', 'provider', 'critic', 'user'])
export const runStatusEnum = pgEnum('run_status', ['pending', 'running', 'completed', 'failed'])
export const parseStatusEnum = pgEnum('parse_status', ['pending', 'success', 'failed'])
export const matchStatusEnum = pgEnum('match_status', ['active', 'settled', 'archived'])
export const commentTargetEnum = pgEnum('comment_target', ['recommendation', 'match', 'tool'])
export const promptLevelEnum = pgEnum('prompt_level', [
  'software-dev-beginner',
  'software-dev-experienced',
  'vibe-coder',
])

// ============================================================================
// USER & AUTH TABLES
// ============================================================================

/**
 * User profiles table - extends Supabase auth.users
 *
 * Note: The `id` column references `auth.users.id` in Supabase.
 * Enforce FK at database level via migration or Supabase dashboard:
 * ALTER TABLE preseason_user_profile
 *   ADD CONSTRAINT fk_user_profile_auth_users
 *   FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
 */
export const userProfiles = createTable(
  'user_profile',
  (d) => ({
    id: uuid().primaryKey().notNull(),
    email: varchar({ length: 255 }).notNull().unique(),
    displayName: varchar('display_name', { length: 150 }).notNull(),
    avatarUrl: varchar('avatar_url', { length: 512 }),
    bio: text('bio'),
    company: varchar({ length: 255 }),
    website: varchar({ length: 255 }),
    role: userRoleEnum().notNull().default('user'),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index('user_profile_email_idx').on(t.email), index('user_profile_role_idx').on(t.role)],
)

// ============================================================================
// CATEGORIES (GROUPS) & SUBCATEGORIES
// ============================================================================

export const categories = createTable(
  'category_group',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    name: d.varchar({ length: 100 }).notNull().unique(),
    slug: d.varchar({ length: 100 }).notNull().unique(),
    description: d.text(),
    icon: d.varchar({ length: 50 }),
    displayOrder: d.integer('display_order').notNull().default(0),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index('category_group_slug_idx').on(t.slug),
    index('category_group_display_order_idx').on(t.displayOrder),
  ],
)

export const subcategories = createTable(
  'category',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    categoryId: d
      .uuid('category_group_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    name: d.varchar({ length: 100 }).notNull().unique(),
    slug: d.varchar({ length: 100 }).notNull().unique(),
    description: d.text(),
    icon: d.varchar({ length: 50 }),
    displayOrder: d.integer('display_order').notNull().default(0),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index('category_slug_idx').on(t.slug),
    index('category_display_order_idx').on(t.displayOrder),
    index('category_group_id_idx').on(t.categoryId),
  ],
)

export const tools = createTable(
  'tool',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    name: d.varchar({ length: 255 }).notNull().unique(),
    slug: d.varchar({ length: 255 }).notNull().unique(),
    description: d.text(),
    website: d.varchar({ length: 512 }),
    logoUrl: d.varchar('logo_url', { length: 512 }),
    isVerified: d.boolean('is_verified').notNull().default(false),
    providerUserId: d
      .uuid('provider_user_id')
      .references(() => userProfiles.id, { onDelete: 'set null' }),
    aliases: d.text().array(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index('tool_slug_idx').on(t.slug),
    index('tool_provider_user_id_idx').on(t.providerUserId),
  ],
)

export const toolCategories = createTable(
  'tool_category',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    toolId: d
      .uuid('tool_id')
      .notNull()
      .references(() => tools.id, { onDelete: 'cascade' }),
    categoryId: d
      .uuid('category_id')
      .notNull()
      .references(() => subcategories.id, { onDelete: 'cascade' }),
    isPrimary: d.boolean('is_primary').notNull().default(false),
  }),
  (t) => [uniqueIndex('tool_category_tool_category_idx').on(t.toolId, t.categoryId)],
)

// ============================================================================
// LLMs & PROMPTS
// ============================================================================

export const llms = createTable(
  'llm',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    name: d.varchar({ length: 255 }).notNull(),
    slug: d.varchar({ length: 255 }).notNull().unique(),
    provider: d.varchar({ length: 100 }).notNull(),
    modelId: d.varchar('model_id', { length: 255 }).notNull(),
    isActive: d.boolean('is_active').notNull().default(true),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index('llm_slug_idx').on(t.slug), index('llm_is_active_idx').on(t.isActive)],
)

export const prompts = createTable(
  'prompt',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    title: d.varchar({ length: 255 }).notNull(),
    slug: d.varchar({ length: 255 }).notNull(),
    level: promptLevelEnum().notNull().default('vibe-coder'),
    description: d.text(),
    expectedCategories: d.text('expected_categories').array(),
    isActive: d.boolean('is_active').notNull().default(true),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    uniqueIndex('prompt_slug_level_idx').on(t.slug, t.level),
    index('prompt_is_active_idx').on(t.isActive),
  ],
)

// ============================================================================
// RUNS & RECOMMENDATIONS
// ============================================================================

export const runs = createTable(
  'run',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    startedAt: d.timestamp('started_at', { withTimezone: true }),
    completedAt: d.timestamp('completed_at', { withTimezone: true }),
    status: runStatusEnum().notNull().default('pending'),
    trigger: d.varchar({ length: 50 }).notNull().default('cron'),
    promptIds: d.uuid('prompt_ids').array(),
    llmIds: d.uuid('llm_ids').array(),
    promptCount: d.integer('prompt_count'),
    llmCount: d.integer('llm_count'),
    errorLog: d.text('error_log'),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [index('run_status_idx').on(t.status), index('run_created_at_idx').on(t.createdAt)],
)

export const runResults = createTable(
  'run_result',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    runId: d
      .uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),
    promptId: d
      .uuid('prompt_id')
      .notNull()
      .references(() => prompts.id, { onDelete: 'cascade' }),
    llmId: d
      .uuid('llm_id')
      .notNull()
      .references(() => llms.id, { onDelete: 'cascade' }),
    rawResponse: d.text('raw_response'),
    parseStatus: parseStatusEnum('parse_status').notNull().default('pending'),
    responseTimeMs: d.integer('response_time_ms'),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    uniqueIndex('run_result_run_prompt_llm_idx').on(t.runId, t.promptId, t.llmId),
    index('run_result_run_id_idx').on(t.runId),
  ],
)

export const recommendations = createTable(
  'recommendation',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    runResultId: d.uuid('run_result_id').notNull(),
    toolId: d
      .uuid('tool_id')
      .notNull()
      .references(() => tools.id, { onDelete: 'cascade' }),
    categoryId: d
      .uuid('category_id')
      .notNull()
      .references(() => subcategories.id, { onDelete: 'cascade' }),
    confidence: d.real(),
    reasoning: d.text(),
    rank: d.integer(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    foreignKey({
      name: 'recommendation_run_result_fk',
      columns: [t.runResultId],
      foreignColumns: [runResults.id],
    }).onDelete('cascade'),
    index('recommendation_tool_category_idx').on(t.toolId, t.categoryId),
    index('recommendation_run_result_id_idx').on(t.runResultId),
  ],
)

// ============================================================================
// MATCHES
// ============================================================================

export const matches = createTable(
  'match',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    toolAId: d
      .uuid('tool_a_id')
      .notNull()
      .references(() => tools.id, { onDelete: 'cascade' }),
    toolBId: d
      .uuid('tool_b_id')
      .notNull()
      .references(() => tools.id, { onDelete: 'cascade' }),
    categoryId: d
      .uuid('category_id')
      .notNull()
      .references(() => subcategories.id, { onDelete: 'cascade' }),
    status: matchStatusEnum().notNull().default('active'),
    startedAt: d.timestamp('started_at', { withTimezone: true }),
    settledAt: d.timestamp('settled_at', { withTimezone: true }),
    periodStart: d.date('period_start').notNull(),
    periodEnd: d.date('period_end'),
    toolAScore: d.integer('tool_a_score').notNull().default(0),
    toolBScore: d.integer('tool_b_score').notNull().default(0),
    totalPrompts: d.integer('total_prompts').notNull().default(0),
    winnerToolId: d.uuid('winner_tool_id').references(() => tools.id, { onDelete: 'set null' }),
  }),
  (t) => [
    uniqueIndex('match_tools_category_period_idx').on(
      t.toolAId,
      t.toolBId,
      t.categoryId,
      t.periodStart,
    ),
    check('match_tool_order_chk', sql`tool_a_id < tool_b_id`),
    index('match_status_idx').on(t.status),
    index('match_category_id_idx').on(t.categoryId),
  ],
)

// ============================================================================
// CRITICS & COMMENTS
// ============================================================================

export const criticProfiles = createTable(
  'critic_profile',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    userId: d
      .uuid('user_id')
      .notNull()
      .unique()
      .references(() => userProfiles.id, { onDelete: 'cascade' }),
    title: d.varchar({ length: 255 }),
    expertiseAreas: d.text('expertise_areas').array(),
    excludedCategories: d.text('excluded_categories').array(),
    verifiedAt: d.timestamp('verified_at', { withTimezone: true }),
    verifiedBy: d.uuid('verified_by'),
    isActive: d.boolean('is_active').notNull().default(true),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    foreignKey({
      name: 'critic_verified_by_user_fk',
      columns: [t.verifiedBy],
      foreignColumns: [userProfiles.id],
    }).onDelete('set null'),
    index('critic_profile_user_id_idx').on(t.userId),
  ],
)

export const comments = createTable(
  'comment',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    criticId: d
      .uuid('critic_id')
      .notNull()
      .references(() => criticProfiles.id, { onDelete: 'cascade' }),
    targetType: commentTargetEnum('target_type').notNull(),
    targetId: d.uuid('target_id').notNull(),
    content: d.text().notNull(),
    isPinned: d.boolean('is_pinned').notNull().default(false),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [
    index('comment_target_idx').on(t.targetType, t.targetId),
    index('comment_critic_id_idx').on(t.criticId),
  ],
)

// ============================================================================
// RELATIONS
// ============================================================================

export const userProfileRelations = relations(userProfiles, ({ one, many }) => ({
  tools: many(tools),
  criticProfile: one(criticProfiles, {
    fields: [userProfiles.id],
    references: [criticProfiles.userId],
    relationName: 'criticUser',
  }),
}))

export const categoryRelations = relations(categories, ({ many }) => ({
  subcategories: many(subcategories),
}))

export const subcategoryRelations = relations(subcategories, ({ one, many }) => ({
  categoryGroup: one(categories, {
    fields: [subcategories.categoryId],
    references: [categories.id],
  }),
  toolCategories: many(toolCategories),
  recommendations: many(recommendations),
  matches: many(matches),
}))

export const toolRelations = relations(tools, ({ one, many }) => ({
  providerUser: one(userProfiles, {
    fields: [tools.providerUserId],
    references: [userProfiles.id],
  }),
  toolCategories: many(toolCategories),
  recommendations: many(recommendations),
}))

export const toolCategoryRelations = relations(toolCategories, ({ one }) => ({
  tool: one(tools, {
    fields: [toolCategories.toolId],
    references: [tools.id],
  }),
  category: one(subcategories, {
    fields: [toolCategories.categoryId],
    references: [subcategories.id],
  }),
}))

export const llmRelations = relations(llms, ({ many }) => ({
  runResults: many(runResults),
}))

export const promptRelations = relations(prompts, ({ many }) => ({
  runResults: many(runResults),
}))

export const runRelations = relations(runs, ({ many }) => ({
  runResults: many(runResults),
}))

export const runResultRelations = relations(runResults, ({ one, many }) => ({
  run: one(runs, {
    fields: [runResults.runId],
    references: [runs.id],
  }),
  prompt: one(prompts, {
    fields: [runResults.promptId],
    references: [prompts.id],
  }),
  llm: one(llms, {
    fields: [runResults.llmId],
    references: [llms.id],
  }),
  recommendations: many(recommendations),
}))

export const recommendationRelations = relations(recommendations, ({ one }) => ({
  runResult: one(runResults, {
    fields: [recommendations.runResultId],
    references: [runResults.id],
  }),
  tool: one(tools, {
    fields: [recommendations.toolId],
    references: [tools.id],
  }),
  category: one(subcategories, {
    fields: [recommendations.categoryId],
    references: [subcategories.id],
  }),
}))

export const matchRelations = relations(matches, ({ one }) => ({
  toolA: one(tools, {
    fields: [matches.toolAId],
    references: [tools.id],
    relationName: 'matchToolA',
  }),
  toolB: one(tools, {
    fields: [matches.toolBId],
    references: [tools.id],
    relationName: 'matchToolB',
  }),
  category: one(subcategories, {
    fields: [matches.categoryId],
    references: [subcategories.id],
  }),
  winner: one(tools, {
    fields: [matches.winnerToolId],
    references: [tools.id],
    relationName: 'matchWinner',
  }),
}))

export const criticProfileRelations = relations(criticProfiles, ({ one, many }) => ({
  user: one(userProfiles, {
    fields: [criticProfiles.userId],
    references: [userProfiles.id],
    relationName: 'criticUser',
  }),
  verifier: one(userProfiles, {
    fields: [criticProfiles.verifiedBy],
    references: [userProfiles.id],
    relationName: 'criticVerifier',
  }),
  comments: many(comments),
}))

export const commentRelations = relations(comments, ({ one }) => ({
  critic: one(criticProfiles, {
    fields: [comments.criticId],
    references: [criticProfiles.id],
  }),
}))
