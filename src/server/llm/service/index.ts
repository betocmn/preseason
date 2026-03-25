import { normalizeProviderToken, PROVIDER_ALIAS_MAP, PROVIDER_REGISTRY } from '~/server/llm/catalog'
import { OpenRouterProvider } from '~/server/llm/service/providers/base'
import type { CompletionRequest, CompletionResponse, ProviderId } from '~/server/llm/service/types'

export function normalizeProviderId(provider: string): ProviderId {
  const normalized = normalizeProviderToken(provider)
  const providerId = PROVIDER_ALIAS_MAP[normalized]

  if (!providerId) {
    throw new Error(`Unsupported provider: ${provider}`)
  }

  return providerId
}

export class LlmService {
  private readonly providers: Record<ProviderId, OpenRouterProvider>

  constructor() {
    this.providers = Object.values(PROVIDER_REGISTRY).reduce<
      Record<ProviderId, OpenRouterProvider>
    >(
      (acc, config) => {
        acc[config.id] = new OpenRouterProvider(config.id, config.namespace)
        return acc
      },
      {} as Record<ProviderId, OpenRouterProvider>,
    )
  }

  getProvider(providerId: ProviderId): OpenRouterProvider {
    return this.providers[providerId]
  }

  async complete(provider: string, request: CompletionRequest): Promise<CompletionResponse> {
    const normalizedProvider = normalizeProviderId(provider)
    return this.getProvider(normalizedProvider).complete(request)
  }
}

export * from '~/server/llm/service/types'
