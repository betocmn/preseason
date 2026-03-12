import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTableCreator,
  real,
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
export const commentTargetEnum = pgEnum('comment_target', [
  'tool',
  'prompt',
])
export const promptLevelEnum = pgEnum('prompt_level', [
  'software-dev-beginner',
  'software-dev-experienced',
  'vibe-coder',
])

// Benchmark enums
export const benchmarkModeEnum = pgEnum('benchmark_mode', ['exploration', 'benchmark'])
export const seasonStatusEnum = pgEnum('season_status', [
  'draft',
  'active',
  'completed',
  'archived',
])
export const runStatusV2Enum = pgEnum('run_status_v2', [
  'pending',
  'running',
  'completed',
  'failed',
  'qc_failed',
  'published',
])
export const caseResultStatusEnum = pgEnum('case_result_status', [
  'pending',
  'completed',
  'failed',
  'invalid_output',
])
export const decisionTypeEnum = pgEnum('decision_type', ['tool', 'none', 'invalid'])
export const toolCandidateStatusEnum = pgEnum('tool_candidate_status', [
  'pending',
  'approved',
  'rejected',
])
export const promptTierEnum = pgEnum('prompt_tier', ['basic', 'intermediate', 'advanced'])
export const modelTierEnum = pgEnum('model_tier', ['frontier', 'mid', 'small'])
export const benchmarkWindowTypeEnum = pgEnum('benchmark_window_type', [
  'run_day',
  'trailing_7d',
  'trailing_28d',
  'season_to_date',
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
    contentMd: d.text('content_md'),
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
// CRITICS & COMMENTS
// ============================================================================

export const criticProfiles = createTable(
  'critic_profile',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    slug: d.varchar({ length: 255 }).notNull().unique(),
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
    index('critic_profile_slug_idx').on(t.slug),
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
// BENCHMARK TABLES
// ============================================================================

export const benchmarkProtocols = createTable(
  'benchmark_protocol',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    slug: d.varchar({ length: 100 }).notNull().unique(),
    name: d.varchar({ length: 255 }).notNull(),
    description: d.text(),
    mode: benchmarkModeEnum().notNull(),
    parserVersion: d.varchar('parser_version', { length: 50 }).notNull(),
    scoringVersion: d.varchar('scoring_version', { length: 50 }).notNull(),
    promptContractVersion: d.varchar('prompt_contract_version', { length: 50 }).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index('benchmark_protocol_slug_idx').on(t.slug)],
)

export const benchmarkSeasons = createTable(
  'benchmark_season',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    protocolId: d
      .uuid('protocol_id')
      .notNull()
      .references(() => benchmarkProtocols.id),
    slug: d.varchar({ length: 100 }).notNull().unique(),
    name: d.varchar({ length: 255 }).notNull(),
    status: seasonStatusEnum().notNull().default('draft'),
    notes: d.text(),
    publishedAt: d.timestamp('published_at', { withTimezone: true }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d.timestamp({ withTimezone: true }).$onUpdate(() => new Date()),
  }),
  (t) => [index('benchmark_season_slug_idx').on(t.slug)],
)

export const benchmarkPromptVersions = createTable(
  'benchmark_prompt_version',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    promptId: d
      .uuid('prompt_id')
      .notNull()
      .references(() => prompts.id),
    slug: d.varchar({ length: 255 }).notNull(),
    level: promptLevelEnum().notNull(),
    version: integer().notNull(),
    tier: promptTierEnum().notNull().default('basic'),
    contentMd: d.text('content_md').notNull(),
    contentHash: d.varchar('content_hash', { length: 64 }).notNull().unique(),
    systemPromptSnapshot: d.text('system_prompt_snapshot'),
    promptContractVersion: d.varchar('prompt_contract_version', { length: 50 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    uniqueIndex('benchmark_prompt_version_prompt_version_idx').on(t.promptId, t.version),
    index('benchmark_prompt_version_prompt_id_idx').on(t.promptId),
  ],
)

export const benchmarkPromptVersionCategories = createTable(
  'benchmark_prompt_version_category',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    promptVersionId: d
      .uuid('prompt_version_id')
      .notNull()
      .references(() => benchmarkPromptVersions.id, { onDelete: 'cascade' }),
    categoryId: d
      .uuid('category_id')
      .notNull()
      .references(() => subcategories.id, { onDelete: 'cascade' }),
    displayOrder: integer('display_order').notNull().default(0),
  }),
  (t) => [uniqueIndex('benchmark_pvc_version_category_idx').on(t.promptVersionId, t.categoryId)],
)

export const benchmarkModelSnapshots = createTable(
  'benchmark_model_snapshot',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    llmId: d
      .uuid('llm_id')
      .notNull()
      .references(() => llms.id),
    name: d.varchar({ length: 255 }).notNull(),
    provider: d.varchar({ length: 100 }).notNull(),
    tier: modelTierEnum().notNull(),
    modelFamilyKey: d.varchar('model_family_key', { length: 100 }),
    requestedModelId: d.varchar('requested_model_id', { length: 255 }).notNull(),
    labelReturnedModelId: d.varchar('label_returned_model_id', { length: 255 }),
    temperature: real(),
    topP: real('top_p'),
    maxTokens: integer('max_tokens'),
    seed: integer(),
    isDeterministic: boolean('is_deterministic').notNull().default(false),
    snapshotKey: d.varchar('snapshot_key', { length: 512 }).notNull().unique(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [index('benchmark_model_snapshot_llm_id_idx').on(t.llmId)],
)

export const benchmarkModelWeightConfigs = createTable(
  'benchmark_model_weight_config',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    slug: d.varchar({ length: 100 }).notNull().unique(),
    name: d.varchar({ length: 255 }).notNull(),
    description: d.text(),
    frontierWeight: real('frontier_weight').notNull().default(1.0),
    midWeight: real('mid_weight').notNull().default(1.0),
    smallWeight: real('small_weight').notNull().default(1.0),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    index('benchmark_model_weight_config_slug_idx').on(t.slug),
    uniqueIndex('benchmark_model_weight_config_one_active_idx')
      .on(t.isActive)
      .where(sql`is_active = true`),
  ],
)

export const benchmarkSeasonPrompts = createTable(
  'benchmark_season_prompt',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    seasonId: d
      .uuid('season_id')
      .notNull()
      .references(() => benchmarkSeasons.id, { onDelete: 'cascade' }),
    promptVersionId: d
      .uuid('prompt_version_id')
      .notNull()
      .references(() => benchmarkPromptVersions.id, { onDelete: 'cascade' }),
  }),
  (t) => [uniqueIndex('benchmark_season_prompt_idx').on(t.seasonId, t.promptVersionId)],
)

export const benchmarkSeasonModels = createTable(
  'benchmark_season_model',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    seasonId: d
      .uuid('season_id')
      .notNull()
      .references(() => benchmarkSeasons.id, { onDelete: 'cascade' }),
    modelSnapshotId: d
      .uuid('model_snapshot_id')
      .notNull()
      .references(() => benchmarkModelSnapshots.id, { onDelete: 'cascade' }),
  }),
  (t) => [uniqueIndex('benchmark_season_model_idx').on(t.seasonId, t.modelSnapshotId)],
)

export const benchmarkCases = createTable(
  'benchmark_case',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    seasonId: d
      .uuid('season_id')
      .notNull()
      .references(() => benchmarkSeasons.id, { onDelete: 'cascade' }),
    promptVersionId: d
      .uuid('prompt_version_id')
      .notNull()
      .references(() => benchmarkPromptVersions.id),
    modelSnapshotId: d
      .uuid('model_snapshot_id')
      .notNull()
      .references(() => benchmarkModelSnapshots.id),
    isActive: boolean('is_active').notNull().default(true),
  }),
  (t) => [
    uniqueIndex('benchmark_case_season_prompt_model_idx').on(
      t.seasonId,
      t.promptVersionId,
      t.modelSnapshotId,
    ),
    foreignKey({
      columns: [t.seasonId, t.promptVersionId],
      foreignColumns: [benchmarkSeasonPrompts.seasonId, benchmarkSeasonPrompts.promptVersionId],
      name: 'benchmark_case_season_prompt_fk',
    }),
    foreignKey({
      columns: [t.seasonId, t.modelSnapshotId],
      foreignColumns: [benchmarkSeasonModels.seasonId, benchmarkSeasonModels.modelSnapshotId],
      name: 'benchmark_case_season_model_fk',
    }),
  ],
)

export const benchmarkRuns = createTable(
  'benchmark_run',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    seasonId: d
      .uuid('season_id')
      .notNull()
      .references(() => benchmarkSeasons.id),
    scheduledFor: date('scheduled_for').notNull(),
    trigger: d.varchar({ length: 50 }).notNull().default('cron'),
    status: runStatusV2Enum().notNull().default('pending'),
    weightConfigId: d.uuid('weight_config_id').references(() => benchmarkModelWeightConfigs.id),
    startedAt: d.timestamp('started_at', { withTimezone: true }),
    completedAt: d.timestamp('completed_at', { withTimezone: true }),
    expectedCaseCount: integer('expected_case_count'),
    completedCaseCount: integer('completed_case_count'),
    failedCaseCount: integer('failed_case_count'),
    qcStatus: d.varchar('qc_status', { length: 50 }),
    qcSummaryJson: jsonb('qc_summary_json'),
    errorLog: d.text('error_log'),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    uniqueIndex('benchmark_run_season_date_idx').on(t.seasonId, t.scheduledFor),
    index('benchmark_run_season_status_idx').on(t.seasonId, t.status),
  ],
)

export const benchmarkCaseResults = createTable(
  'benchmark_case_result',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    seasonId: d
      .uuid('season_id')
      .notNull()
      .references(() => benchmarkSeasons.id),
    runId: d
      .uuid('run_id')
      .notNull()
      .references(() => benchmarkRuns.id, { onDelete: 'cascade' }),
    caseId: d
      .uuid('case_id')
      .notNull()
      .references(() => benchmarkCases.id),
    status: caseResultStatusEnum().notNull().default('pending'),
    naturalResponse: d.text('natural_response'),
    appendixRaw: d.text('appendix_raw'),
    appendixJson: jsonb('appendix_json'),
    rawResponse: d.text('raw_response'),
    requestedModelId: d.varchar('requested_model_id', { length: 255 }),
    returnedModelId: d.varchar('returned_model_id', { length: 255 }),
    provider: d.varchar({ length: 100 }),
    finishReason: d.varchar('finish_reason', { length: 50 }),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    totalTokens: integer('total_tokens'),
    latencyMs: integer('latency_ms'),
    temperature: real(),
    topP: real('top_p'),
    maxTokens: integer('max_tokens'),
    parserVersion: d.varchar('parser_version', { length: 50 }),
    promptHash: d.varchar('prompt_hash', { length: 64 }),
    systemPromptSnapshot: d.text('system_prompt_snapshot'),
    errorMessage: d.text('error_message'),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    uniqueIndex('benchmark_case_result_run_case_idx').on(t.runId, t.caseId),
    index('benchmark_case_result_run_status_idx').on(t.runId, t.status),
    index('benchmark_case_result_case_id_idx').on(t.caseId),
    index('benchmark_case_result_season_id_idx').on(t.seasonId),
  ],
)

export const benchmarkCaseDecisions = createTable(
  'benchmark_case_decision',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    caseResultId: d
      .uuid('case_result_id')
      .notNull()
      .references(() => benchmarkCaseResults.id, { onDelete: 'cascade' }),
    categoryId: d
      .uuid('category_id')
      .notNull()
      .references(() => subcategories.id),
    decisionType: decisionTypeEnum('decision_type').notNull(),
    toolId: d.uuid('tool_id').references(() => tools.id),
    rawToolName: d.varchar('raw_tool_name', { length: 255 }),
    reasoning: d.text(),
    selfReportedConfidence: real('self_reported_confidence'),
    resolutionStatus: d.varchar('resolution_status', { length: 50 }).notNull().default('resolved'),
  }),
  (t) => [
    uniqueIndex('benchmark_case_decision_result_category_idx').on(t.caseResultId, t.categoryId),
    index('benchmark_case_decision_category_type_idx').on(t.categoryId, t.decisionType),
    index('benchmark_case_decision_tool_id_idx').on(t.toolId),
    index('benchmark_case_decision_result_id_idx').on(t.caseResultId),
    check(
      'benchmark_decision_tool_check',
      sql`decision_type != 'tool' OR tool_id IS NOT NULL OR resolution_status = 'unresolved_tool'`,
    ),
    check('benchmark_decision_non_tool_no_tool_id', sql`decision_type = 'tool' OR tool_id IS NULL`),
  ],
)

// ============================================================================
// TOOL ALIASES & CANDIDATES
// ============================================================================

export const toolAliases = createTable(
  'tool_alias',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    toolId: d
      .uuid('tool_id')
      .notNull()
      .references(() => tools.id, { onDelete: 'cascade' }),
    alias: d.varchar({ length: 255 }).notNull(),
    normalizedAlias: d.varchar('normalized_alias', { length: 255 }).notNull().unique(),
    source: d.varchar({ length: 100 }),
    createdAt: d
      .timestamp({ withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [index('tool_alias_tool_id_idx').on(t.toolId)],
)

export const toolCandidates = createTable(
  'tool_candidate',
  (d) => ({
    id: d.uuid().primaryKey().defaultRandom().notNull(),
    rawName: d.varchar('raw_name', { length: 255 }).notNull(),
    normalizedName: d.varchar('normalized_name', { length: 255 }).notNull().unique(),
    firstSeenAt: d
      .timestamp('first_seen_at', { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    lastSeenAt: d
      .timestamp('last_seen_at', { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    seenCount: integer('seen_count').notNull().default(1),
    suggestedCategoryId: d
      .uuid('suggested_category_id')
      .references(() => subcategories.id, { onDelete: 'set null' }),
    status: toolCandidateStatusEnum().notNull().default('pending'),
    approvedToolId: d.uuid('approved_tool_id').references(() => tools.id, { onDelete: 'set null' }),
    notes: d.text(),
  }),
  (t) => [index('tool_candidate_status_idx').on(t.status)],
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
  benchmarkPromptVersionCategories: many(benchmarkPromptVersionCategories),
  benchmarkCaseDecisions: many(benchmarkCaseDecisions),
}))

export const toolRelations = relations(tools, ({ one, many }) => ({
  providerUser: one(userProfiles, {
    fields: [tools.providerUserId],
    references: [userProfiles.id],
  }),
  toolCategories: many(toolCategories),
  toolAliases: many(toolAliases),
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
  benchmarkModelSnapshots: many(benchmarkModelSnapshots),
}))

export const promptRelations = relations(prompts, ({ many }) => ({
  benchmarkPromptVersions: many(benchmarkPromptVersions),
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

// ============================================================================
// BENCHMARK RELATIONS
// ============================================================================

export const benchmarkProtocolRelations = relations(benchmarkProtocols, ({ many }) => ({
  seasons: many(benchmarkSeasons),
}))

export const benchmarkSeasonRelations = relations(benchmarkSeasons, ({ one, many }) => ({
  protocol: one(benchmarkProtocols, {
    fields: [benchmarkSeasons.protocolId],
    references: [benchmarkProtocols.id],
  }),
  seasonPrompts: many(benchmarkSeasonPrompts),
  seasonModels: many(benchmarkSeasonModels),
  cases: many(benchmarkCases),
  runs: many(benchmarkRuns),
}))

export const benchmarkPromptVersionRelations = relations(
  benchmarkPromptVersions,
  ({ one, many }) => ({
    prompt: one(prompts, {
      fields: [benchmarkPromptVersions.promptId],
      references: [prompts.id],
    }),
    categories: many(benchmarkPromptVersionCategories),
    seasonPrompts: many(benchmarkSeasonPrompts),
    cases: many(benchmarkCases),
  }),
)

export const benchmarkPromptVersionCategoryRelations = relations(
  benchmarkPromptVersionCategories,
  ({ one }) => ({
    promptVersion: one(benchmarkPromptVersions, {
      fields: [benchmarkPromptVersionCategories.promptVersionId],
      references: [benchmarkPromptVersions.id],
    }),
    category: one(subcategories, {
      fields: [benchmarkPromptVersionCategories.categoryId],
      references: [subcategories.id],
    }),
  }),
)

export const benchmarkModelSnapshotRelations = relations(
  benchmarkModelSnapshots,
  ({ one, many }) => ({
    llm: one(llms, {
      fields: [benchmarkModelSnapshots.llmId],
      references: [llms.id],
    }),
    seasonModels: many(benchmarkSeasonModels),
    cases: many(benchmarkCases),
  }),
)

export const benchmarkModelWeightConfigRelations = relations(
  benchmarkModelWeightConfigs,
  ({ many }) => ({
    runs: many(benchmarkRuns),
  }),
)

export const benchmarkSeasonPromptRelations = relations(benchmarkSeasonPrompts, ({ one }) => ({
  season: one(benchmarkSeasons, {
    fields: [benchmarkSeasonPrompts.seasonId],
    references: [benchmarkSeasons.id],
  }),
  promptVersion: one(benchmarkPromptVersions, {
    fields: [benchmarkSeasonPrompts.promptVersionId],
    references: [benchmarkPromptVersions.id],
  }),
}))

export const benchmarkSeasonModelRelations = relations(benchmarkSeasonModels, ({ one }) => ({
  season: one(benchmarkSeasons, {
    fields: [benchmarkSeasonModels.seasonId],
    references: [benchmarkSeasons.id],
  }),
  modelSnapshot: one(benchmarkModelSnapshots, {
    fields: [benchmarkSeasonModels.modelSnapshotId],
    references: [benchmarkModelSnapshots.id],
  }),
}))

export const benchmarkCaseRelations = relations(benchmarkCases, ({ one, many }) => ({
  season: one(benchmarkSeasons, {
    fields: [benchmarkCases.seasonId],
    references: [benchmarkSeasons.id],
  }),
  promptVersion: one(benchmarkPromptVersions, {
    fields: [benchmarkCases.promptVersionId],
    references: [benchmarkPromptVersions.id],
  }),
  modelSnapshot: one(benchmarkModelSnapshots, {
    fields: [benchmarkCases.modelSnapshotId],
    references: [benchmarkModelSnapshots.id],
  }),
  results: many(benchmarkCaseResults),
}))

export const benchmarkRunRelations = relations(benchmarkRuns, ({ one, many }) => ({
  season: one(benchmarkSeasons, {
    fields: [benchmarkRuns.seasonId],
    references: [benchmarkSeasons.id],
  }),
  weightConfig: one(benchmarkModelWeightConfigs, {
    fields: [benchmarkRuns.weightConfigId],
    references: [benchmarkModelWeightConfigs.id],
  }),
  results: many(benchmarkCaseResults),
}))

export const benchmarkCaseResultRelations = relations(benchmarkCaseResults, ({ one, many }) => ({
  season: one(benchmarkSeasons, {
    fields: [benchmarkCaseResults.seasonId],
    references: [benchmarkSeasons.id],
  }),
  run: one(benchmarkRuns, {
    fields: [benchmarkCaseResults.runId],
    references: [benchmarkRuns.id],
  }),
  case: one(benchmarkCases, {
    fields: [benchmarkCaseResults.caseId],
    references: [benchmarkCases.id],
  }),
  decisions: many(benchmarkCaseDecisions),
}))

export const benchmarkCaseDecisionRelations = relations(benchmarkCaseDecisions, ({ one }) => ({
  caseResult: one(benchmarkCaseResults, {
    fields: [benchmarkCaseDecisions.caseResultId],
    references: [benchmarkCaseResults.id],
  }),
  category: one(subcategories, {
    fields: [benchmarkCaseDecisions.categoryId],
    references: [subcategories.id],
  }),
  tool: one(tools, {
    fields: [benchmarkCaseDecisions.toolId],
    references: [tools.id],
  }),
}))

export const toolAliasRelations = relations(toolAliases, ({ one }) => ({
  tool: one(tools, {
    fields: [toolAliases.toolId],
    references: [tools.id],
  }),
}))

export const toolCandidateRelations = relations(toolCandidates, ({ one }) => ({
  suggestedCategory: one(subcategories, {
    fields: [toolCandidates.suggestedCategoryId],
    references: [subcategories.id],
  }),
  approvedTool: one(tools, {
    fields: [toolCandidates.approvedToolId],
    references: [tools.id],
  }),
}))
