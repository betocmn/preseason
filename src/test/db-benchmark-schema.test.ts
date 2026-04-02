import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  benchmarkCaseDecisions,
  benchmarkCaseResults,
  benchmarkCases,
  benchmarkModelSnapshots,
  benchmarkModelWeightConfigs,
  benchmarkPromptVersionCategories,
  benchmarkPromptVersions,
  benchmarkProtocols,
  benchmarkRuns,
  benchmarkSeasonModels,
  benchmarkSeasonPrompts,
  benchmarkSeasons,
  categories,
  llms,
  prompts,
  subcategories,
  toolAliases,
  toolCandidates,
  tools,
} from '~/server/db/schema'
import { cleanTestDatabase, getTestDb, setupTestDatabase, teardownTestDatabase } from './db'

function first<T>(rows: T[]): T {
  const row = rows[0]
  if (row === undefined) throw new Error('Expected at least one row')
  return row
}

async function seedCategoryGroup(db: ReturnType<typeof getTestDb>) {
  return first(
    await db
      .insert(categories)
      .values({ name: 'Devtools', slug: 'devtools', displayOrder: 1 })
      .returning(),
  )
}

async function seedSubcategory(db: ReturnType<typeof getTestDb>, groupId: string) {
  return first(
    await db
      .insert(subcategories)
      .values({
        categoryId: groupId,
        name: 'Auth',
        slug: 'auth',
        displayOrder: 1,
      })
      .returning(),
  )
}

async function seedProtocol(db: ReturnType<typeof getTestDb>) {
  return first(
    await db
      .insert(benchmarkProtocols)
      .values({
        slug: 'benchmark-v2',
        name: 'Benchmark V2',
        mode: 'benchmark',
        parserVersion: '1.0',
        scoringVersion: '1.0',
        promptContractVersion: '1.0',
      })
      .returning(),
  )
}

async function seedSeason(db: ReturnType<typeof getTestDb>, protocolId: string) {
  return first(
    await db
      .insert(benchmarkSeasons)
      .values({
        protocolId,
        slug: 'season-1',
        name: 'Season 1',
        status: 'draft',
      })
      .returning(),
  )
}

async function seedPrompt(db: ReturnType<typeof getTestDb>) {
  return first(
    await db
      .insert(prompts)
      .values({
        title: 'Build a todo app',
        slug: 'build-todo-app',
        level: 'beginner',
      })
      .returning(),
  )
}

async function seedLlm(db: ReturnType<typeof getTestDb>) {
  return first(
    await db
      .insert(llms)
      .values({
        name: 'Claude Opus',
        slug: 'claude-opus',
        provider: 'anthropic',
        company: 'Anthropic',
        modelFamily: 'Opus',
        modelVersion: '3',
        modelId: 'claude-3-opus-20240229',
      })
      .returning(),
  )
}

async function seedTool(db: ReturnType<typeof getTestDb>) {
  return first(await db.insert(tools).values({ name: 'Supabase', slug: 'supabase' }).returning())
}

async function seedPromptVersion(db: ReturnType<typeof getTestDb>, promptId: string) {
  return first(
    await db
      .insert(benchmarkPromptVersions)
      .values({
        promptId,
        slug: 'build-todo-app',
        level: 'beginner',
        version: 1,
        contentMd: '# Build a todo app',
        contentHash: 'abc123def456',
        promptContractVersion: '1.0',
      })
      .returning(),
  )
}

async function seedModelSnapshot(db: ReturnType<typeof getTestDb>, llmId: string) {
  return first(
    await db
      .insert(benchmarkModelSnapshots)
      .values({
        llmId,
        name: 'Claude Opus',
        provider: 'anthropic',
        company: 'Anthropic',
        modelFamily: 'Opus',
        modelVersion: '3',
        tier: 'frontier',
        requestedModelId: 'claude-3-opus-20240229',
        temperature: 0.2,
        snapshotKey: 'claude-3-opus-20240229:0.2:1:1200:null',
      })
      .returning(),
  )
}

async function seedSeasonPanel(
  db: ReturnType<typeof getTestDb>,
  seasonId: string,
  promptVersionId: string,
  modelSnapshotId: string,
) {
  await db.insert(benchmarkSeasonPrompts).values({ seasonId, promptVersionId })
  await db.insert(benchmarkSeasonModels).values({ seasonId, modelSnapshotId })
}

describe('Benchmark Schema', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  afterAll(async () => {
    await teardownTestDatabase()
  })

  beforeEach(async () => {
    await cleanTestDatabase()
  })

  // ========================================================================
  // Benchmark Runs — Idempotency Key
  // ========================================================================

  describe('Benchmark Runs', () => {
    it('should enforce unique constraint on (season_id, scheduled_for)', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const season = await seedSeason(db, protocol.id)

      await db.insert(benchmarkRuns).values({
        seasonId: season.id,
        scheduledFor: '2026-03-10',
        trigger: 'cron',
        status: 'pending',
      })

      await expect(
        db.insert(benchmarkRuns).values({
          seasonId: season.id,
          scheduledFor: '2026-03-10',
          trigger: 'manual',
          status: 'pending',
        }),
      ).rejects.toThrow()
    })

    it('should allow runs on different dates for the same season', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const season = await seedSeason(db, protocol.id)

      await db.insert(benchmarkRuns).values({
        seasonId: season.id,
        scheduledFor: '2026-03-10',
      })
      await db.insert(benchmarkRuns).values({
        seasonId: season.id,
        scheduledFor: '2026-03-11',
      })

      const allRuns = await db.select().from(benchmarkRuns)
      expect(allRuns).toHaveLength(2)
    })
  })

  // ========================================================================
  // Benchmark Cases — Unique Constraint
  // ========================================================================

  describe('Benchmark Cases', () => {
    it('should enforce unique constraint on (season_id, prompt_version_id, model_snapshot_id)', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const season = await seedSeason(db, protocol.id)
      const prompt = await seedPrompt(db)
      const llm = await seedLlm(db)
      const pv = await seedPromptVersion(db, prompt.id)
      const ms = await seedModelSnapshot(db, llm.id)

      await seedSeasonPanel(db, season.id, pv.id, ms.id)
      await db.insert(benchmarkCases).values({
        seasonId: season.id,
        promptVersionId: pv.id,
        modelSnapshotId: ms.id,
      })

      await expect(
        db.insert(benchmarkCases).values({
          seasonId: season.id,
          promptVersionId: pv.id,
          modelSnapshotId: ms.id,
        }),
      ).rejects.toThrow()
    })
  })

  // ========================================================================
  // Tool Aliases — Normalized Uniqueness
  // ========================================================================

  describe('Tool Aliases', () => {
    it('should enforce unique normalized_alias', async () => {
      const db = getTestDb()
      const tool = await seedTool(db)

      await db.insert(toolAliases).values({
        toolId: tool.id,
        alias: 'Supa Base',
        normalizedAlias: 'supabase',
        source: 'migration',
      })

      await expect(
        db.insert(toolAliases).values({
          toolId: tool.id,
          alias: 'SupaBase',
          normalizedAlias: 'supabase',
          source: 'migration',
        }),
      ).rejects.toThrow()
    })

    it('should allow different normalized aliases for the same tool', async () => {
      const db = getTestDb()
      const tool = await seedTool(db)

      await db.insert(toolAliases).values({
        toolId: tool.id,
        alias: 'Supa',
        normalizedAlias: 'supa',
        source: 'migration',
      })
      await db.insert(toolAliases).values({
        toolId: tool.id,
        alias: 'SB',
        normalizedAlias: 'sb',
        source: 'admin',
      })

      const aliases = await db.select().from(toolAliases)
      expect(aliases).toHaveLength(2)
    })

    it('should cascade delete when tool is deleted', async () => {
      const db = getTestDb()
      const tool = await seedTool(db)

      await db.insert(toolAliases).values({
        toolId: tool.id,
        alias: 'Supa',
        normalizedAlias: 'supa',
        source: 'migration',
      })

      await db.delete(tools)
      const aliases = await db.select().from(toolAliases)
      expect(aliases).toHaveLength(0)
    })
  })

  // ========================================================================
  // Case Decisions — Integrity Check
  // ========================================================================

  describe('Case Decisions', () => {
    it('should reject decision_type=tool when tool_id is null', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const season = await seedSeason(db, protocol.id)
      const prompt = await seedPrompt(db)
      const llm = await seedLlm(db)
      const pv = await seedPromptVersion(db, prompt.id)
      const ms = await seedModelSnapshot(db, llm.id)
      const group = await seedCategoryGroup(db)
      const sub = await seedSubcategory(db, group.id)

      await seedSeasonPanel(db, season.id, pv.id, ms.id)
      const benchmarkCase = first(
        await db
          .insert(benchmarkCases)
          .values({
            seasonId: season.id,
            promptVersionId: pv.id,
            modelSnapshotId: ms.id,
          })
          .returning(),
      )

      const run = first(
        await db
          .insert(benchmarkRuns)
          .values({ seasonId: season.id, scheduledFor: '2026-03-10' })
          .returning(),
      )

      const caseResult = first(
        await db
          .insert(benchmarkCaseResults)
          .values({
            seasonId: season.id,
            runId: run.id,
            caseId: benchmarkCase.id,
            status: 'completed',
          })
          .returning(),
      )

      await expect(
        db.insert(benchmarkCaseDecisions).values({
          caseResultId: caseResult.id,
          categoryId: sub.id,
          decisionType: 'tool',
          toolId: null,
          rawToolName: 'Supabase',
          resolutionStatus: 'resolved',
        }),
      ).rejects.toThrow()
    })

    it('should allow decision_type=none with null tool_id', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const season = await seedSeason(db, protocol.id)
      const prompt = await seedPrompt(db)
      const llm = await seedLlm(db)
      const pv = await seedPromptVersion(db, prompt.id)
      const ms = await seedModelSnapshot(db, llm.id)
      const group = await seedCategoryGroup(db)
      const sub = await seedSubcategory(db, group.id)

      await seedSeasonPanel(db, season.id, pv.id, ms.id)
      const benchmarkCase = first(
        await db
          .insert(benchmarkCases)
          .values({
            seasonId: season.id,
            promptVersionId: pv.id,
            modelSnapshotId: ms.id,
          })
          .returning(),
      )

      const run = first(
        await db
          .insert(benchmarkRuns)
          .values({ seasonId: season.id, scheduledFor: '2026-03-10' })
          .returning(),
      )

      const caseResult = first(
        await db
          .insert(benchmarkCaseResults)
          .values({
            seasonId: season.id,
            runId: run.id,
            caseId: benchmarkCase.id,
            status: 'completed',
          })
          .returning(),
      )

      const [decision] = await db
        .insert(benchmarkCaseDecisions)
        .values({
          caseResultId: caseResult.id,
          categoryId: sub.id,
          decisionType: 'none',
          toolId: null,
          reasoning: 'No database needed',
          resolutionStatus: 'resolved',
        })
        .returning()

      expect(decision).toBeDefined()
      expect(decision?.decisionType).toBe('none')
      expect(decision?.toolId).toBeNull()
    })

    it('should allow decision_type=tool with null tool_id when unresolved_tool', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const season = await seedSeason(db, protocol.id)
      const prompt = await seedPrompt(db)
      const llm = await seedLlm(db)
      const pv = await seedPromptVersion(db, prompt.id)
      const ms = await seedModelSnapshot(db, llm.id)
      const group = await seedCategoryGroup(db)
      const sub = await seedSubcategory(db, group.id)

      await seedSeasonPanel(db, season.id, pv.id, ms.id)
      const benchmarkCase = first(
        await db
          .insert(benchmarkCases)
          .values({
            seasonId: season.id,
            promptVersionId: pv.id,
            modelSnapshotId: ms.id,
          })
          .returning(),
      )

      const run = first(
        await db
          .insert(benchmarkRuns)
          .values({ seasonId: season.id, scheduledFor: '2026-03-10' })
          .returning(),
      )

      const caseResult = first(
        await db
          .insert(benchmarkCaseResults)
          .values({
            seasonId: season.id,
            runId: run.id,
            caseId: benchmarkCase.id,
            status: 'completed',
          })
          .returning(),
      )

      const [decision] = await db
        .insert(benchmarkCaseDecisions)
        .values({
          caseResultId: caseResult.id,
          categoryId: sub.id,
          decisionType: 'tool',
          toolId: null,
          rawToolName: 'UnknownTool',
          resolutionStatus: 'unresolved_tool',
        })
        .returning()

      expect(decision).toBeDefined()
      expect(decision?.decisionType).toBe('tool')
      expect(decision?.toolId).toBeNull()
      expect(decision?.resolutionStatus).toBe('unresolved_tool')
    })

    it('should allow decision_type=tool with valid tool_id', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const season = await seedSeason(db, protocol.id)
      const prompt = await seedPrompt(db)
      const llm = await seedLlm(db)
      const pv = await seedPromptVersion(db, prompt.id)
      const ms = await seedModelSnapshot(db, llm.id)
      const group = await seedCategoryGroup(db)
      const sub = await seedSubcategory(db, group.id)
      const tool = await seedTool(db)

      await seedSeasonPanel(db, season.id, pv.id, ms.id)
      const benchmarkCase = first(
        await db
          .insert(benchmarkCases)
          .values({
            seasonId: season.id,
            promptVersionId: pv.id,
            modelSnapshotId: ms.id,
          })
          .returning(),
      )

      const run = first(
        await db
          .insert(benchmarkRuns)
          .values({ seasonId: season.id, scheduledFor: '2026-03-10' })
          .returning(),
      )

      const caseResult = first(
        await db
          .insert(benchmarkCaseResults)
          .values({
            seasonId: season.id,
            runId: run.id,
            caseId: benchmarkCase.id,
            status: 'completed',
          })
          .returning(),
      )

      const [decision] = await db
        .insert(benchmarkCaseDecisions)
        .values({
          caseResultId: caseResult.id,
          categoryId: sub.id,
          decisionType: 'tool',
          toolId: tool.id,
          rawToolName: 'Supabase',
          selfReportedConfidence: 0.85,
          resolutionStatus: 'resolved',
        })
        .returning()

      expect(decision).toBeDefined()
      expect(decision?.decisionType).toBe('tool')
      expect(decision?.toolId).toBe(tool.id)
    })

    it('should enforce unique constraint on (case_result_id, category_id)', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const season = await seedSeason(db, protocol.id)
      const prompt = await seedPrompt(db)
      const llm = await seedLlm(db)
      const pv = await seedPromptVersion(db, prompt.id)
      const ms = await seedModelSnapshot(db, llm.id)
      const group = await seedCategoryGroup(db)
      const sub = await seedSubcategory(db, group.id)
      const tool = await seedTool(db)

      await seedSeasonPanel(db, season.id, pv.id, ms.id)
      const benchmarkCase = first(
        await db
          .insert(benchmarkCases)
          .values({
            seasonId: season.id,
            promptVersionId: pv.id,
            modelSnapshotId: ms.id,
          })
          .returning(),
      )

      const run = first(
        await db
          .insert(benchmarkRuns)
          .values({ seasonId: season.id, scheduledFor: '2026-03-10' })
          .returning(),
      )

      const caseResult = first(
        await db
          .insert(benchmarkCaseResults)
          .values({
            seasonId: season.id,
            runId: run.id,
            caseId: benchmarkCase.id,
            status: 'completed',
          })
          .returning(),
      )

      await db.insert(benchmarkCaseDecisions).values({
        caseResultId: caseResult.id,
        categoryId: sub.id,
        decisionType: 'tool',
        toolId: tool.id,
        rawToolName: 'Supabase',
        resolutionStatus: 'resolved',
      })

      await expect(
        db.insert(benchmarkCaseDecisions).values({
          caseResultId: caseResult.id,
          categoryId: sub.id,
          decisionType: 'none',
          resolutionStatus: 'resolved',
        }),
      ).rejects.toThrow()
    })

    it('should reject decision_type=none with non-null tool_id', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const season = await seedSeason(db, protocol.id)
      const prompt = await seedPrompt(db)
      const llm = await seedLlm(db)
      const pv = await seedPromptVersion(db, prompt.id)
      const ms = await seedModelSnapshot(db, llm.id)
      const group = await seedCategoryGroup(db)
      const sub = await seedSubcategory(db, group.id)
      const tool = await seedTool(db)

      await seedSeasonPanel(db, season.id, pv.id, ms.id)
      const benchmarkCase = first(
        await db
          .insert(benchmarkCases)
          .values({
            seasonId: season.id,
            promptVersionId: pv.id,
            modelSnapshotId: ms.id,
          })
          .returning(),
      )

      const run = first(
        await db
          .insert(benchmarkRuns)
          .values({ seasonId: season.id, scheduledFor: '2026-03-10' })
          .returning(),
      )

      const caseResult = first(
        await db
          .insert(benchmarkCaseResults)
          .values({
            seasonId: season.id,
            runId: run.id,
            caseId: benchmarkCase.id,
            status: 'completed',
          })
          .returning(),
      )

      await expect(
        db.insert(benchmarkCaseDecisions).values({
          caseResultId: caseResult.id,
          categoryId: sub.id,
          decisionType: 'none',
          toolId: tool.id,
          resolutionStatus: 'resolved',
        }),
      ).rejects.toThrow()
    })
  })

  // ========================================================================
  // Tool Candidates
  // ========================================================================

  describe('Tool Candidates', () => {
    it('should enforce unique normalized_name', async () => {
      const db = getTestDb()

      await db.insert(toolCandidates).values({
        rawName: 'SupaBase',
        normalizedName: 'supabase',
        status: 'pending',
      })

      await expect(
        db.insert(toolCandidates).values({
          rawName: 'Supa Base',
          normalizedName: 'supabase',
          status: 'pending',
        }),
      ).rejects.toThrow()
    })
  })

  // ========================================================================
  // Prompt Versions
  // ========================================================================

  describe('Prompt Versions', () => {
    it('should enforce unique content_hash', async () => {
      const db = getTestDb()
      const prompt = await seedPrompt(db)

      await db.insert(benchmarkPromptVersions).values({
        promptId: prompt.id,
        slug: 'build-todo-app',
        level: 'beginner',
        version: 1,
        contentMd: '# Build a todo app',
        contentHash: 'same-hash',
        promptContractVersion: '1.0',
      })

      await expect(
        db.insert(benchmarkPromptVersions).values({
          promptId: prompt.id,
          slug: 'build-todo-app',
          level: 'beginner',
          version: 2,
          contentMd: '# Build a todo app',
          contentHash: 'same-hash',
          promptContractVersion: '1.0',
        }),
      ).rejects.toThrow()
    })

    it('should enforce unique (prompt_id, version)', async () => {
      const db = getTestDb()
      const prompt = await seedPrompt(db)

      await db.insert(benchmarkPromptVersions).values({
        promptId: prompt.id,
        slug: 'build-todo-app',
        level: 'beginner',
        version: 1,
        contentMd: '# Build a todo app v1',
        contentHash: 'hash-v1',
        promptContractVersion: '1.0',
      })

      await expect(
        db.insert(benchmarkPromptVersions).values({
          promptId: prompt.id,
          slug: 'build-todo-app',
          level: 'beginner',
          version: 1,
          contentMd: '# Build a todo app v1 modified',
          contentHash: 'hash-v1-modified',
          promptContractVersion: '1.0',
        }),
      ).rejects.toThrow()
    })
  })

  // ========================================================================
  // Model Snapshots
  // ========================================================================

  describe('Model Snapshots', () => {
    it('should enforce unique snapshot_key', async () => {
      const db = getTestDb()
      const llm = await seedLlm(db)

      await db.insert(benchmarkModelSnapshots).values({
        llmId: llm.id,
        name: 'Claude Opus',
        provider: 'anthropic',
        company: 'Anthropic',
        modelFamily: 'Opus',
        modelVersion: '3',
        tier: 'frontier',
        requestedModelId: 'claude-3-opus',
        temperature: 0.2,
        snapshotKey: 'same-key',
      })

      await expect(
        db.insert(benchmarkModelSnapshots).values({
          llmId: llm.id,
          name: 'Claude Opus v2',
          provider: 'anthropic',
          company: 'Anthropic',
          modelFamily: 'Opus',
          modelVersion: '3.1',
          tier: 'frontier',
          requestedModelId: 'claude-3-opus',
          temperature: 0.3,
          snapshotKey: 'same-key',
        }),
      ).rejects.toThrow()
    })
  })

  // ========================================================================
  // Season and Panel Management
  // ========================================================================

  describe('Season Panel', () => {
    it('should enforce unique (season_id, prompt_version_id) in season prompts', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const season = await seedSeason(db, protocol.id)
      const prompt = await seedPrompt(db)
      const pv = await seedPromptVersion(db, prompt.id)

      await db.insert(benchmarkSeasonPrompts).values({
        seasonId: season.id,
        promptVersionId: pv.id,
      })

      await expect(
        db.insert(benchmarkSeasonPrompts).values({
          seasonId: season.id,
          promptVersionId: pv.id,
        }),
      ).rejects.toThrow()
    })

    it('should enforce unique (season_id, model_snapshot_id) in season models', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const season = await seedSeason(db, protocol.id)
      const llm = await seedLlm(db)
      const ms = await seedModelSnapshot(db, llm.id)

      await db.insert(benchmarkSeasonModels).values({
        seasonId: season.id,
        modelSnapshotId: ms.id,
      })

      await expect(
        db.insert(benchmarkSeasonModels).values({
          seasonId: season.id,
          modelSnapshotId: ms.id,
        }),
      ).rejects.toThrow()
    })
  })

  // ========================================================================
  // Prompt Version Categories
  // ========================================================================

  describe('Prompt Version Categories', () => {
    it('should enforce unique (prompt_version_id, category_id)', async () => {
      const db = getTestDb()
      const prompt = await seedPrompt(db)
      const pv = await seedPromptVersion(db, prompt.id)
      const group = await seedCategoryGroup(db)
      const sub = await seedSubcategory(db, group.id)

      await db.insert(benchmarkPromptVersionCategories).values({
        promptVersionId: pv.id,
        categoryId: sub.id,
        displayOrder: 1,
      })

      await expect(
        db.insert(benchmarkPromptVersionCategories).values({
          promptVersionId: pv.id,
          categoryId: sub.id,
          displayOrder: 2,
        }),
      ).rejects.toThrow()
    })
  })

  // ========================================================================
  // Case Results — Unique Constraint
  // ========================================================================

  describe('Case Results', () => {
    it('should enforce unique (run_id, case_id)', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const season = await seedSeason(db, protocol.id)
      const prompt = await seedPrompt(db)
      const llm = await seedLlm(db)
      const pv = await seedPromptVersion(db, prompt.id)
      const ms = await seedModelSnapshot(db, llm.id)

      await seedSeasonPanel(db, season.id, pv.id, ms.id)
      const benchmarkCase = first(
        await db
          .insert(benchmarkCases)
          .values({
            seasonId: season.id,
            promptVersionId: pv.id,
            modelSnapshotId: ms.id,
          })
          .returning(),
      )

      const run = first(
        await db
          .insert(benchmarkRuns)
          .values({ seasonId: season.id, scheduledFor: '2026-03-10' })
          .returning(),
      )

      await db.insert(benchmarkCaseResults).values({
        seasonId: season.id,
        runId: run.id,
        caseId: benchmarkCase.id,
        status: 'completed',
      })

      await expect(
        db.insert(benchmarkCaseResults).values({
          seasonId: season.id,
          runId: run.id,
          caseId: benchmarkCase.id,
          status: 'pending',
        }),
      ).rejects.toThrow()
    })

    it('should reject case result with mismatched season_id', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const seasonA = await seedSeason(db, protocol.id)

      const seasonB = first(
        await db
          .insert(benchmarkSeasons)
          .values({
            protocolId: protocol.id,
            slug: 'season-2',
            name: 'Season 2',
            status: 'draft',
          })
          .returning(),
      )

      const prompt = await seedPrompt(db)
      const llm = await seedLlm(db)
      const pv = await seedPromptVersion(db, prompt.id)
      const ms = await seedModelSnapshot(db, llm.id)

      // Case belongs to season A
      await seedSeasonPanel(db, seasonA.id, pv.id, ms.id)
      const benchmarkCase = first(
        await db
          .insert(benchmarkCases)
          .values({
            seasonId: seasonA.id,
            promptVersionId: pv.id,
            modelSnapshotId: ms.id,
          })
          .returning(),
      )

      // Run belongs to season A
      const run = first(
        await db
          .insert(benchmarkRuns)
          .values({ seasonId: seasonA.id, scheduledFor: '2026-03-10' })
          .returning(),
      )

      // Try to insert case result with season B — should fail
      await expect(
        db.insert(benchmarkCaseResults).values({
          seasonId: seasonB.id,
          runId: run.id,
          caseId: benchmarkCase.id,
          status: 'completed',
        }),
      ).rejects.toThrow()
    })
  })

  // ========================================================================
  // Weight Configs
  // ========================================================================

  describe('Weight Configs', () => {
    it('should enforce unique slug', async () => {
      const db = getTestDb()

      await db.insert(benchmarkModelWeightConfigs).values({
        slug: 'uniform-v1',
        name: 'Uniform V1',
        frontierWeight: 1.0,
        midWeight: 1.0,
        smallWeight: 1.0,
        isActive: true,
      })

      await expect(
        db.insert(benchmarkModelWeightConfigs).values({
          slug: 'uniform-v1',
          name: 'Uniform V1 duplicate',
          frontierWeight: 1.0,
          midWeight: 1.0,
          smallWeight: 1.0,
          isActive: false,
        }),
      ).rejects.toThrow()
    })

    it('should enforce only one active weight config', async () => {
      const db = getTestDb()

      await db.insert(benchmarkModelWeightConfigs).values({
        slug: 'config-a',
        name: 'Config A',
        frontierWeight: 1.0,
        midWeight: 1.0,
        smallWeight: 1.0,
        isActive: true,
      })

      await expect(
        db.insert(benchmarkModelWeightConfigs).values({
          slug: 'config-b',
          name: 'Config B',
          frontierWeight: 2.0,
          midWeight: 2.0,
          smallWeight: 2.0,
          isActive: true,
        }),
      ).rejects.toThrow()
    })

    it('should allow multiple inactive weight configs', async () => {
      const db = getTestDb()

      await db.insert(benchmarkModelWeightConfigs).values({
        slug: 'config-a',
        name: 'Config A',
        frontierWeight: 1.0,
        midWeight: 1.0,
        smallWeight: 1.0,
        isActive: false,
      })

      await db.insert(benchmarkModelWeightConfigs).values({
        slug: 'config-b',
        name: 'Config B',
        frontierWeight: 2.0,
        midWeight: 2.0,
        smallWeight: 2.0,
        isActive: false,
      })

      const configs = await db.select().from(benchmarkModelWeightConfigs)
      expect(configs).toHaveLength(2)
    })
  })

  // ========================================================================
  // Protocols
  // ========================================================================

  describe('Protocols', () => {
    it('should enforce unique slug', async () => {
      const db = getTestDb()

      await seedProtocol(db)

      await expect(
        db.insert(benchmarkProtocols).values({
          slug: 'benchmark-v2',
          name: 'Benchmark V2 duplicate',
          mode: 'benchmark',
          parserVersion: '1.0',
          scoringVersion: '1.0',
          promptContractVersion: '1.0',
        }),
      ).rejects.toThrow()
    })
  })

  // ========================================================================
  // Season ID Immutability
  // ========================================================================

  describe('Season ID Immutability', () => {
    it('should prevent updating season_id on benchmark_run', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const seasonA = await seedSeason(db, protocol.id)
      const seasonB = first(
        await db
          .insert(benchmarkSeasons)
          .values({ protocolId: protocol.id, slug: 'season-2', name: 'Season 2', status: 'draft' })
          .returning(),
      )

      const run = first(
        await db
          .insert(benchmarkRuns)
          .values({ seasonId: seasonA.id, scheduledFor: '2026-03-10' })
          .returning(),
      )

      await expect(
        db.update(benchmarkRuns).set({ seasonId: seasonB.id }).where(eq(benchmarkRuns.id, run.id)),
      ).rejects.toThrow(/immutable/)
    })

    it('should prevent updating season_id on benchmark_case', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const seasonA = await seedSeason(db, protocol.id)
      const seasonB = first(
        await db
          .insert(benchmarkSeasons)
          .values({ protocolId: protocol.id, slug: 'season-2', name: 'Season 2', status: 'draft' })
          .returning(),
      )
      const prompt = await seedPrompt(db)
      const llm = await seedLlm(db)
      const pv = await seedPromptVersion(db, prompt.id)
      const ms = await seedModelSnapshot(db, llm.id)

      await seedSeasonPanel(db, seasonA.id, pv.id, ms.id)
      const benchmarkCase = first(
        await db
          .insert(benchmarkCases)
          .values({ seasonId: seasonA.id, promptVersionId: pv.id, modelSnapshotId: ms.id })
          .returning(),
      )

      await expect(
        db
          .update(benchmarkCases)
          .set({ seasonId: seasonB.id })
          .where(eq(benchmarkCases.id, benchmarkCase.id)),
      ).rejects.toThrow(/immutable/)
    })

    it('should prevent updating season_id on benchmark_case_result', async () => {
      const db = getTestDb()
      const protocol = await seedProtocol(db)
      const seasonA = await seedSeason(db, protocol.id)
      const seasonB = first(
        await db
          .insert(benchmarkSeasons)
          .values({ protocolId: protocol.id, slug: 'season-2', name: 'Season 2', status: 'draft' })
          .returning(),
      )
      const prompt = await seedPrompt(db)
      const llm = await seedLlm(db)
      const pv = await seedPromptVersion(db, prompt.id)
      const ms = await seedModelSnapshot(db, llm.id)

      await seedSeasonPanel(db, seasonA.id, pv.id, ms.id)
      const benchmarkCase = first(
        await db
          .insert(benchmarkCases)
          .values({ seasonId: seasonA.id, promptVersionId: pv.id, modelSnapshotId: ms.id })
          .returning(),
      )

      const run = first(
        await db
          .insert(benchmarkRuns)
          .values({ seasonId: seasonA.id, scheduledFor: '2026-03-10' })
          .returning(),
      )

      const caseResult = first(
        await db
          .insert(benchmarkCaseResults)
          .values({
            seasonId: seasonA.id,
            runId: run.id,
            caseId: benchmarkCase.id,
            status: 'completed',
          })
          .returning(),
      )

      await expect(
        db
          .update(benchmarkCaseResults)
          .set({ seasonId: seasonB.id })
          .where(eq(benchmarkCaseResults.id, caseResult.id)),
      ).rejects.toThrow(/immutable|season_id/)
    })
  })
})
