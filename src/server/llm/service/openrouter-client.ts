import OpenAI from 'openai'
import { serverSettings } from '~/constants/server-settings'
import { env } from '~/env'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const CLIENT_TITLE = 'Preseason'

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type OpenRouterInferenceParams = {
  temperature?: number
  top_p?: number
  max_tokens?: number
  seed?: number
}

export type OpenRouterCompletionResponse = {
  content: string
  requestedModel: string
  returnedModel: string
  finishReason: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  latencyMs: number
}

let client: OpenAI | null = null

type RetryOptions = {
  maxAttempts?: number
  baseDelayMs?: number
}

function resolveHttpReferer() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL

  if (!raw) {
    return undefined
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return raw
  }

  return `https://${raw}`
}

function getClient() {
  if (client) {
    return client
  }

  if (!env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not configured')
  }

  const referer = resolveHttpReferer()

  client = new OpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: OPENROUTER_BASE_URL,
    defaultHeaders: {
      ...(referer ? { 'HTTP-Referer': referer } : {}),
      'X-OpenRouter-Title': CLIENT_TITLE,
      'X-Title': CLIENT_TITLE,
    },
  })

  return client
}

function getContent(choice: OpenAI.Chat.Completions.ChatCompletion.Choice | undefined) {
  if (!choice) {
    return ''
  }

  const content = choice.message.content
  return typeof content === 'string' ? content : ''
}

function getErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 'Unknown OpenRouter error'
  }

  if ('message' in error && typeof error.message === 'string') {
    const status =
      'status' in error && typeof error.status === 'number' ? ` (status ${error.status})` : ''
    return `${error.message}${status}`
  }

  return 'Unknown OpenRouter error'
}

function getErrorStatus(error: unknown) {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : null
}

function isRetryableTransportError(error: unknown) {
  const status = getErrorStatus(error)
  if (status !== null && (status === 408 || status === 409 || status === 429 || status >= 500)) {
    return true
  }

  const message = getErrorMessage(error).toLowerCase()

  return [
    'terminated',
    'unexpected end of json input',
    'fetch failed',
    'network',
    'socket hang up',
    'econnreset',
    'etimedout',
    'timeout',
    'body terminated',
    'connection error',
  ].some((pattern) => message.includes(pattern))
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function complete(
  model: string,
  messages: OpenRouterMessage[],
  params?: OpenRouterInferenceParams,
  retryOptions?: RetryOptions,
): Promise<OpenRouterCompletionResponse> {
  const startedAt = Date.now()
  const maxAttempts = retryOptions?.maxAttempts ?? serverSettings.openRouter.transportRetryAttempts
  const baseDelayMs =
    retryOptions?.baseDelayMs ?? serverSettings.openRouter.transportRetryBaseDelayMs
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await getClient().chat.completions.create({
        model,
        messages,
        ...(params?.temperature !== undefined && { temperature: params.temperature }),
        ...(params?.top_p !== undefined && { top_p: params.top_p }),
        ...(params?.max_tokens !== undefined && { max_tokens: params.max_tokens }),
        ...(params?.seed !== undefined && { seed: params.seed }),
      })

      const firstChoice = response.choices[0]

      return {
        content: getContent(firstChoice),
        requestedModel: model,
        returnedModel: response.model,
        finishReason: firstChoice?.finish_reason ?? 'unknown',
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
          totalTokens: response.usage?.total_tokens ?? 0,
        },
        latencyMs: Date.now() - startedAt,
      }
    } catch (error) {
      lastError = error

      if (attempt >= maxAttempts || !isRetryableTransportError(error)) {
        break
      }

      await sleep(baseDelayMs * attempt)
    }
  }

  throw new Error(`OpenRouter completion failed: ${getErrorMessage(lastError)}`)
}
