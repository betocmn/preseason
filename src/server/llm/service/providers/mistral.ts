import { BaseLlmProvider } from '~/server/llm/service/providers/base'

export class MistralProvider extends BaseLlmProvider {
  constructor() {
    super('mistral', 'mistralai')
  }
}
