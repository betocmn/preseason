import { complete as completeWithOpenRouter } from '~/server/llm/service/openrouter-client'
import type { CompletionRequest, CompletionResponse, ProviderId } from '~/server/llm/service/types'

export abstract class BaseLlmProvider {
  protected constructor(
    private readonly provider: ProviderId,
    private readonly modelPrefix: string,
  ) {}

  private normalizeModel(model: string) {
    if (model.startsWith(`${this.modelPrefix}/`)) {
      return model
    }

    if (model.includes('/')) {
      return model
    }

    return `${this.modelPrefix}/${model}`
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const model = this.normalizeModel(request.model)

    const completion = await completeWithOpenRouter(model, [
      {
        role: 'system',
        content: request.systemPrompt,
      },
      {
        role: 'user',
        content: request.userPrompt,
      },
    ])

    return {
      ...completion,
      model: completion.model || model,
      provider: this.provider,
    }
  }
}
