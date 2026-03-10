import {
  complete as completeWithOpenRouter,
  type OpenRouterInferenceParams,
} from '~/server/llm/service/openrouter-client'
import type { CompletionRequest, CompletionResponse, ProviderId } from '~/server/llm/service/types'

export abstract class BaseLlmProvider {
  protected constructor(
    private readonly provider: ProviderId,
    private readonly modelPrefix: string,
  ) {}

  private normalizeProviderToken(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '')
  }

  private normalizeModel(model: string) {
    const normalizedModel = model.trim()
    if (!normalizedModel) {
      throw new Error('Model id is required')
    }

    const [rawNamespace, ...rest] = normalizedModel.split('/')

    if (rest.length === 0) {
      return `${this.modelPrefix}/${normalizedModel}`
    }

    const namespace = rawNamespace?.trim()
    const modelName = rest.join('/').trim()
    if (!namespace || !modelName) {
      throw new Error(`Invalid model id: ${model}`)
    }

    const normalizedNamespace = this.normalizeProviderToken(namespace)
    const expectedNamespace = this.normalizeProviderToken(this.modelPrefix)

    if (normalizedNamespace !== expectedNamespace) {
      throw new Error(`Model namespace "${namespace}" does not match provider "${this.provider}"`)
    }

    return `${namespace}/${modelName}`
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = this.normalizeModel(request.model)

    const inferenceParams: OpenRouterInferenceParams | undefined =
      request.temperature !== undefined ||
      request.topP !== undefined ||
      request.maxTokens !== undefined ||
      request.seed !== undefined
        ? {
            temperature: request.temperature,
            top_p: request.topP,
            max_tokens: request.maxTokens,
            seed: request.seed,
          }
        : undefined

    const completion = await completeWithOpenRouter(
      model,
      [
        {
          role: 'system',
          content: request.systemPrompt,
        },
        {
          role: 'user',
          content: request.userPrompt,
        },
      ],
      inferenceParams,
    )

    return {
      ...completion,
      requestedModel: model,
      returnedModel: completion.returnedModel || model,
      provider: this.provider,
    }
  }
}
