import { BaseLlmProvider } from '~/server/llm/service/providers/base'

export class OpenAiProvider extends BaseLlmProvider {
  constructor() {
    super('openai', 'openai')
  }
}
