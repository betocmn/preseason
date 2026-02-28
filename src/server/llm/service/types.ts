export const PROVIDER_IDS = [
  'anthropic',
  'openai',
  'google',
  'meta',
  'mistral',
  'deepseek',
] as const

export type ProviderId = (typeof PROVIDER_IDS)[number]

export type CompletionRequest = {
  model: string
  systemPrompt: string
  userPrompt: string
}

export type CompletionResponse = {
  content: string
  model: string
  provider: ProviderId
  finishReason: string
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  latencyMs: number
}
