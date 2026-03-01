import { BaseLlmProvider } from '~/server/llm/service/providers/base'

export class GoogleProvider extends BaseLlmProvider {
  constructor() {
    super('google', 'google')
  }
}
