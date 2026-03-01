import { BaseLlmProvider } from '~/server/llm/service/providers/base'

export class DeepSeekProvider extends BaseLlmProvider {
  constructor() {
    super('deepseek', 'deepseek')
  }
}
