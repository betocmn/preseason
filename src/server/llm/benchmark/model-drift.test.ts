import { describe, expect, it } from 'vitest'
import { checkModelDrift } from '~/server/llm/benchmark/model-drift'

describe('checkModelDrift', () => {
  it('returns hasDrift=false when models match exactly', () => {
    const result = checkModelDrift('gpt-4o', 'gpt-4o')
    expect(result.hasDrift).toBe(false)
  })

  it('returns hasDrift=false when models match after stripping provider prefix', () => {
    const result = checkModelDrift('openai/gpt-4o', 'gpt-4o')
    expect(result.hasDrift).toBe(false)
  })

  it('returns hasDrift=false when both have provider prefixes', () => {
    const result = checkModelDrift('openai/gpt-4o', 'openai/gpt-4o')
    expect(result.hasDrift).toBe(false)
  })

  it('returns hasDrift=true when models differ', () => {
    const result = checkModelDrift('gpt-4o', 'gpt-4o-2024-11-20')
    expect(result.hasDrift).toBe(true)
  })

  it('returns hasDrift=true for subtle version differences', () => {
    const result = checkModelDrift(
      'anthropic/claude-3-opus-20240229',
      'anthropic/claude-3-opus-20240307',
    )
    expect(result.hasDrift).toBe(true)
  })

  it('preserves original model strings in result', () => {
    const result = checkModelDrift('openai/gpt-4o', 'gpt-4o-mini')
    expect(result.requestedModel).toBe('openai/gpt-4o')
    expect(result.returnedModel).toBe('gpt-4o-mini')
    expect(result.hasDrift).toBe(true)
  })

  it('is case-insensitive', () => {
    const result = checkModelDrift('GPT-4o', 'gpt-4o')
    expect(result.hasDrift).toBe(false)
  })
})
