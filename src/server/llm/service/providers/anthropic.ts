import { BaseLlmProvider } from '~/server/llm/service/providers/base'

export class AnthropicProvider extends BaseLlmProvider {
  constructor() {
    super('anthropic', 'anthropic')
  }
}
