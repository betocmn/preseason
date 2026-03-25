import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_MATCH_PROMPT_TEMPLATES } from '~/server/db/default-match-prompt-templates'
import { getTestDb, setupTestDatabase, teardownTestDatabase } from '~/test/db'

describe('ensureDefaultMatchPromptTemplates', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  }, 120_000)

  afterAll(async () => {
    await teardownTestDatabase()
  })

  it('seeds the default prompt templates on a fresh database', async () => {
    const db = getTestDb()
    const templates = await db.query.matchPromptTemplates.findMany()

    expect(templates.map((template) => template.slug).sort()).toEqual(
      DEFAULT_MATCH_PROMPT_TEMPLATES.map((template) => template.slug).sort(),
    )

    const activeTemplates = templates.filter((template) => template.isActive)
    expect(activeTemplates).toHaveLength(1)
    expect(activeTemplates[0]?.slug).toBe('balanced-comparison-v1')

    const balancedTemplate = templates.find(
      (template) => template.slug === 'balanced-comparison-v1',
    )
    expect(balancedTemplate?.schemaVersion).toBe('match-v2')
    expect(balancedTemplate?.templateMd).toContain('{{TOOL_A}}')
    expect(balancedTemplate?.templateMd).toContain('{{TOOL_B}}')
  })

  it('keeps the seeded templates queryable through the schema', async () => {
    const db = getTestDb()
    const activeTemplates = await db.query.matchPromptTemplates.findMany({
      where: (fields, { eq }) => eq(fields.isActive, true),
    })

    expect(activeTemplates).toHaveLength(1)
    expect(activeTemplates[0]?.slug).toBe('balanced-comparison-v1')
  })
})
