import { AnthropicProvider } from '~/server/llm/service/providers/anthropic'
import { BaseLlmProvider } from '~/server/llm/service/providers/base'
import { DeepSeekProvider } from '~/server/llm/service/providers/deepseek'
import { GoogleProvider } from '~/server/llm/service/providers/google'
import { MetaProvider } from '~/server/llm/service/providers/meta'
import { MistralProvider } from '~/server/llm/service/providers/mistral'
import { OpenAiProvider } from '~/server/llm/service/providers/openai'
import type { CompletionRequest, CompletionResponse, ProviderId } from '~/server/llm/service/types'

const PROVIDER_ALIASES: Record<string, ProviderId> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
  gemini: 'google',
  meta: 'meta',
  'meta-llama': 'meta',
  mistral: 'mistral',
  mistralai: 'mistral',
  deepseek: 'deepseek',
}

export function normalizeProviderId(provider: string): ProviderId {
  const normalized = provider.trim().toLowerCase().replace(/\s+/g, '')
  const providerId = PROVIDER_ALIASES[normalized]

  if (!providerId) {
    throw new Error(`Unsupported provider: ${provider}`)
  }

  return providerId
}

export class LlmService {
  private readonly providers: Record<ProviderId, BaseLlmProvider>

  constructor() {
    this.providers = {
      anthropic: new AnthropicProvider(),
      openai: new OpenAiProvider(),
      google: new GoogleProvider(),
      meta: new MetaProvider(),
      mistral: new MistralProvider(),
      deepseek: new DeepSeekProvider(),
    }
  }

  getProvider(providerId: ProviderId): BaseLlmProvider {
    return this.providers[providerId]
  }

  async complete(
    provider: string,
    request: CompletionRequest,
  ): Promise<CompletionResponse> {
    const normalizedProvider = normalizeProviderId(provider)
    return this.getProvider(normalizedProvider).complete(request)
  }
}

export * from '~/server/llm/service/types'
