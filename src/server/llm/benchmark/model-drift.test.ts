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

  it('treats OpenRouter dated aliases as non-drift when the request used an alias', () => {
    const result = checkModelDrift('gpt-4o', 'gpt-4o-2024-11-20')
    expect(result.hasDrift).toBe(false)
  })

  it('treats OpenRouter snapshot suffixes as non-drift for observed provider aliases', () => {
    expect(
      checkModelDrift('anthropic/claude-haiku-4.5', 'anthropic/claude-4.5-haiku-20251001').hasDrift,
    ).toBe(false)
    expect(checkModelDrift('openai/gpt-5.4-mini', 'openai/gpt-5.4-mini-20260317').hasDrift).toBe(
      false,
    )
    expect(
      checkModelDrift('qwen/qwen3-coder-next', 'qwen/qwen3-coder-next-2025-02-03').hasDrift,
    ).toBe(false)
  })

  it('returns hasDrift=true when model families differ', () => {
    const result = checkModelDrift('gpt-4o', 'gpt-4.1')
    expect(result.hasDrift).toBe(true)
  })

  it('keeps strict comparison for explicitly version-pinned requests', () => {
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
