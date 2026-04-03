import { beforeEach, describe, expect, it, vi } from 'vitest'

const completeMock = vi.hoisted(() => vi.fn())

vi.mock('~/server/llm/service/openrouter-client', () => ({
  complete: completeMock,
}))

import { LlmService, normalizeProviderId } from '~/server/llm/service'

const providerCases = [
  { provider: 'anthropic', model: 'claude-3-5-sonnet' },
  { provider: 'openai', model: 'gpt-4o' },
  { provider: 'google', model: 'gemini-1.5-pro' },
  { provider: 'meta', model: 'llama-3.1-70b-instruct' },
  { provider: 'mistral', model: 'mistral-large-latest' },
  { provider: 'deepseek', model: 'deepseek-chat' },
  { provider: 'zai', model: 'glm-5-turbo' },
  { provider: 'minimax', model: 'minimax-m2.7' },
  { provider: 'xiaomi', model: 'mimo-v2-pro' },
  { provider: 'moonshotai', model: 'kimi-k2.5' },
  { provider: 'qwen', model: 'qwen3-coder-next' },
] as const

describe('llm providers', () => {
  beforeEach(() => {
    completeMock.mockReset()
    completeMock.mockResolvedValue({
      content: '{"recommendations":[]}',
      requestedModel: 'mock-requested-model',
      returnedModel: 'mock-returned-model',
      finishReason: 'stop',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
      latencyMs: 123,
    })
  })

  it.each(providerCases)('prefixes model correctly for $provider', async ({ provider, model }) => {
    const providerInstance = new LlmService().getProvider(provider)

    const result = await providerInstance.complete({
      model,
      systemPrompt: 'sys',
      userPrompt: 'usr',
    })

    expect(completeMock).toHaveBeenCalledTimes(1)
    const [calledModel] = completeMock.mock.calls[0] as [string, unknown]
    expect(calledModel).toContain('/')
    expect(result.provider).toBe(provider)
  })

  it('does not double-prefix model ids that already include provider namespace', async () => {
    const provider = new LlmService().getProvider('openai')

    await provider.complete({
      model: 'openai/gpt-4o',
      systemPrompt: 'sys',
      userPrompt: 'usr',
    })

    expect(completeMock).toHaveBeenCalledWith(
      'openai/gpt-4o',
      expect.arrayContaining([
        expect.objectContaining({ role: 'system', content: 'sys' }),
        expect.objectContaining({ role: 'user', content: 'usr' }),
      ]),
      undefined,
    )
  })

  it('rejects model ids that use a different provider namespace', async () => {
    const provider = new LlmService().getProvider('openai')

    await expect(
      provider.complete({
        model: 'anthropic/claude-3-5-sonnet',
        systemPrompt: 'sys',
        userPrompt: 'usr',
      }),
    ).rejects.toThrow('does not match provider')

    expect(completeMock).not.toHaveBeenCalled()
  })

  it('resolves provider aliases in the service factory', async () => {
    const service = new LlmService()

    await service.complete('Mistral AI', {
      model: 'mistral-large-latest',
      systemPrompt: 'sys',
      userPrompt: 'usr',
    })

    const [calledModel] = completeMock.mock.calls[0] as [string, unknown]
    expect(calledModel).toBe('mistralai/mistral-large-latest')
  })

  it('throws for unsupported providers', async () => {
    const service = new LlmService()

    await expect(
      service.complete('unsupported-vendor', {
        model: 'unknown-model',
        systemPrompt: 'sys',
        userPrompt: 'usr',
      }),
    ).rejects.toThrow('Unsupported provider')
  })

  it('normalizes known provider values', () => {
    expect(normalizeProviderId('OpenAI')).toBe('openai')
    expect(normalizeProviderId('Google')).toBe('google')
    expect(normalizeProviderId('Meta')).toBe('meta')
    expect(normalizeProviderId('Meta Llama')).toBe('meta')
    expect(normalizeProviderId('Mistral AI')).toBe('mistral')
    expect(normalizeProviderId('DeepSeek')).toBe('deepseek')
    expect(normalizeProviderId('Z.ai')).toBe('zai')
    expect(normalizeProviderId('MiniMax')).toBe('minimax')
    expect(normalizeProviderId('Xiaomi')).toBe('xiaomi')
    expect(normalizeProviderId('MoonshotAI')).toBe('moonshotai')
    expect(normalizeProviderId('Qwen')).toBe('qwen')
  })

  it('propagates client errors from provider completion', async () => {
    completeMock.mockRejectedValueOnce(new Error('rate limited'))
    const provider = new LlmService().getProvider('anthropic')

    await expect(
      provider.complete({
        model: 'claude-3-5-sonnet',
        systemPrompt: 'sys',
        userPrompt: 'usr',
      }),
    ).rejects.toThrow('rate limited')
  })

  it('passes inference params to client when provided', async () => {
    const provider = new LlmService().getProvider('anthropic')

    await provider.complete({
      model: 'claude-3-5-sonnet',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      temperature: 0.2,
      topP: 1,
      maxTokens: 1200,
      seed: 42,
    })

    expect(completeMock).toHaveBeenCalledWith('anthropic/claude-3-5-sonnet', expect.any(Array), {
      temperature: 0.2,
      top_p: 1,
      max_tokens: 1200,
      seed: 42,
    })
  })

  it('omits inference params when not provided', async () => {
    const provider = new LlmService().getProvider('anthropic')

    await provider.complete({
      model: 'claude-3-5-sonnet',
      systemPrompt: 'sys',
      userPrompt: 'usr',
    })

    expect(completeMock).toHaveBeenCalledWith(
      'anthropic/claude-3-5-sonnet',
      expect.any(Array),
      undefined,
    )
  })

  it('response includes both requestedModel and returnedModel', async () => {
    const provider = new LlmService().getProvider('openai')

    const result = await provider.complete({
      model: 'gpt-4o',
      systemPrompt: 'sys',
      userPrompt: 'usr',
    })

    expect(result.requestedModel).toBe('openai/gpt-4o')
    expect(result.returnedModel).toBe('mock-returned-model')
    expect(result).not.toHaveProperty('model')
  })

  it('passes timeout overrides to the client when provided', async () => {
    const provider = new LlmService().getProvider('openai')

    await provider.complete({
      model: 'gpt-4o',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      timeoutMs: 123_000,
    })

    expect(completeMock).toHaveBeenCalledWith(
      'openai/gpt-4o',
      expect.any(Array),
      undefined,
      { timeoutMs: 123_000 },
    )
  })
})
