import { describe, expect, it } from 'vitest'
import { buildMatchPrompt } from './prompt-builder'

const baseContext = {
  templateMd: 'Compare {{TOOL_A}} vs {{TOOL_B}} for {{CATEGORY}}.',
  toolAName: 'Clerk',
  toolBName: 'Auth0',
  categoryName: 'Authentication',
}

describe('buildMatchPrompt', () => {
  it('should replace all placeholders', () => {
    const result = buildMatchPrompt(baseContext)
    expect(result).toContain('Compare Clerk vs Auth0 for Authentication.')
    expect(result).not.toContain('{{TOOL_A}}')
    expect(result).not.toContain('{{TOOL_B}}')
    expect(result).not.toContain('{{CATEGORY}}')
  })

  it('should include preseason_match_json tags', () => {
    const result = buildMatchPrompt(baseContext)
    expect(result).toContain('<preseason_match_json>')
    expect(result).toContain('</preseason_match_json>')
  })

  it('should replace multiple occurrences of the same placeholder', () => {
    const result = buildMatchPrompt({
      ...baseContext,
      templateMd: '{{TOOL_A}} is compared to {{TOOL_B}}. Pick {{TOOL_A}} or {{TOOL_B}}.',
    })
    expect(result).toContain('Clerk is compared to Auth0. Pick Clerk or Auth0.')
  })

  it('should preserve dollar sequences in replacement values', () => {
    const result = buildMatchPrompt({
      templateMd: 'Compare {{TOOL_A}} vs {{TOOL_B}} for {{CATEGORY}}.',
      toolAName: 'Alpha $&',
      toolBName: 'Beta $$',
      categoryName: "Cat $' $` $1",
    })

    expect(result).toContain("Compare Alpha $& vs Beta $$ for Cat $' $` $1.")
    expect(result).not.toContain('{{TOOL_A}}')
    expect(result).not.toContain('{{TOOL_B}}')
    expect(result).not.toContain('{{CATEGORY}}')
  })

  it('should include schema version in the example', () => {
    const result = buildMatchPrompt(baseContext)
    expect(result).toContain('"schema_version": "match-v2"')
  })

  it('should include structured output instructions', () => {
    const result = buildMatchPrompt(baseContext)
    expect(result).toContain('machine-readable appendix')
    expect(result).toContain('"winner"')
    expect(result).toContain('"comparison_summary"')
    expect(result).toContain('"confidence"')
  })
})
