import { describe, expect, it } from 'vitest'
import { classifyModelTier, extractModelFamilyKey } from '~/server/llm/benchmark/model-tier'

describe('classifyModelTier', () => {
  it.each([
    { modelId: 'claude-3-opus-20240229', expected: 'frontier' },
    { modelId: 'anthropic/claude-3-opus-20240229', expected: 'frontier' },
    { modelId: 'gpt-4o', expected: 'frontier' },
    { modelId: 'openai/gpt-4o-2024-08-06', expected: 'frontier' },
    { modelId: 'gpt-4-turbo', expected: 'frontier' },
    { modelId: 'gemini-1.5-pro', expected: 'frontier' },
    { modelId: 'google/gemini-2.0-pro', expected: 'frontier' },
  ])('classifies $modelId as frontier', ({ modelId, expected }) => {
    expect(classifyModelTier(modelId)).toBe(expected)
  })

  it.each([
    { modelId: 'claude-3.5-sonnet-20241022', expected: 'mid' },
    { modelId: 'anthropic/claude-3.7-sonnet', expected: 'mid' },
    { modelId: 'gpt-4o-mini', expected: 'mid' },
    { modelId: 'openai/gpt-4o-mini-2024-07-18', expected: 'mid' },
    { modelId: 'mistral-large-latest', expected: 'mid' },
    { modelId: 'mistralai/mistral-large-latest', expected: 'mid' },
  ])('classifies $modelId as mid', ({ modelId, expected }) => {
    expect(classifyModelTier(modelId)).toBe(expected)
  })

  it.each([
    { modelId: 'meta-llama/llama-3.1-70b-instruct', expected: 'small' },
    { modelId: 'deepseek-chat', expected: 'small' },
    { modelId: 'deepseek/deepseek-v2.5', expected: 'small' },
    { modelId: 'deepseek/deepseek-v3', expected: 'small' },
  ])('classifies $modelId as small', ({ modelId, expected }) => {
    expect(classifyModelTier(modelId)).toBe(expected)
  })

  it('defaults unknown models to mid', () => {
    expect(classifyModelTier('some-unknown-model')).toBe('mid')
    expect(classifyModelTier('custom/my-fine-tune')).toBe('mid')
  })

  it('is case-insensitive', () => {
    expect(classifyModelTier('Claude-3-Opus')).toBe('frontier')
    expect(classifyModelTier('GPT-4O-MINI')).toBe('mid')
  })
})

describe('extractModelFamilyKey', () => {
  it('strips provider prefix', () => {
    expect(extractModelFamilyKey('anthropic/claude-3.5-sonnet')).toBe('claude-3.5-sonnet')
    expect(extractModelFamilyKey('openai/gpt-4o')).toBe('gpt-4o')
  })

  it('strips date suffix', () => {
    expect(extractModelFamilyKey('claude-3.5-sonnet-20241022')).toBe('claude-3.5-sonnet')
  })

  it('strips version tags', () => {
    expect(extractModelFamilyKey('mistral-large:latest')).toBe('mistral-large')
  })

  it('handles plain model names', () => {
    expect(extractModelFamilyKey('gpt-4o')).toBe('gpt-4o')
    expect(extractModelFamilyKey('deepseek-chat')).toBe('deepseek-chat')
  })

  it('lowercases the result', () => {
    expect(extractModelFamilyKey('Claude-3-Opus')).toBe('claude-3-opus')
  })

  it('strips provider prefix and date suffix together', () => {
    expect(extractModelFamilyKey('anthropic/claude-3-opus-20240229')).toBe('claude-3-opus')
  })
})
