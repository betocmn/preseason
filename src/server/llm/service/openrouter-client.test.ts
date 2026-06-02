import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createMock = vi.hoisted(() => vi.fn())

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: createMock,
      },
    }
  },
}))

vi.mock('~/env', () => ({
  env: {
    OPENROUTER_API_KEY: 'test-openrouter-key',
  },
}))

describe('openrouter-client', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    createMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.resetModules()
  })

  it('retries transient terminated responses and succeeds', async () => {
    createMock.mockRejectedValueOnce(new Error('terminated')).mockResolvedValueOnce({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      model: 'openai/gpt-5.4-pro',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 12,
        total_tokens: 22,
      },
    })

    const { complete } = await import('~/server/llm/service/openrouter-client')
    const completionPromise = complete(
      'openai/gpt-5.4-pro',
      [{ role: 'user', content: 'hello' }],
      undefined,
      { maxAttempts: 3, baseDelayMs: 1_000 },
    )

    await vi.runAllTimersAsync()

    await expect(completionPromise).resolves.toMatchObject({
      content: 'ok',
      requestedModel: 'openai/gpt-5.4-pro',
      returnedModel: 'openai/gpt-5.4-pro',
      finishReason: 'stop',
    })
    expect(createMock).toHaveBeenCalledTimes(2)
    expect(createMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model: 'openai/gpt-5.4-pro',
      }),
      expect.objectContaining({
        maxRetries: 0,
        timeout: 300_000,
      }),
    )
  })

  it('retries transient truncated json parse errors and then throws after max attempts', async () => {
    createMock.mockRejectedValue(new SyntaxError('Unexpected end of JSON input'))

    const { complete } = await import('~/server/llm/service/openrouter-client')
    const completionPromise = complete(
      'moonshotai/kimi-k2.5',
      [{ role: 'user', content: 'hello' }],
      undefined,
      { maxAttempts: 3, baseDelayMs: 1_000 },
    )
    const expectation = expect(completionPromise).rejects.toThrow(
      'OpenRouter completion failed: Unexpected end of JSON input',
    )

    await vi.runAllTimersAsync()

    await expectation
    expect(createMock).toHaveBeenCalledTimes(3)
  })

  it('does not retry non-retryable client errors', async () => {
    createMock.mockRejectedValue({
      message: 'Bad request',
      status: 400,
    })

    const { complete } = await import('~/server/llm/service/openrouter-client')
    const completionPromise = complete(
      'openai/gpt-5.4-pro',
      [{ role: 'user', content: 'hello' }],
      undefined,
      { maxAttempts: 3, baseDelayMs: 1_000 },
    )
    const expectation = expect(completionPromise).rejects.toThrow(
      'OpenRouter completion failed: Bad request',
    )

    await vi.runAllTimersAsync()

    await expectation
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('uses a request-specific timeout override when provided', async () => {
    createMock.mockResolvedValue({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      model: 'openai/gpt-5.4-pro',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 12,
        total_tokens: 22,
      },
    })

    const { complete } = await import('~/server/llm/service/openrouter-client')

    await complete('openai/gpt-5.4-pro', [{ role: 'user', content: 'hello' }], undefined, {
      timeoutMs: 123_000,
    })

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'openai/gpt-5.4-pro' }),
      expect.objectContaining({
        maxRetries: 0,
        timeout: 123_000,
      }),
    )
  })
})
