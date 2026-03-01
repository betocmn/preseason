import { BaseLlmProvider } from '~/server/llm/service/providers/base'

export class MetaProvider extends BaseLlmProvider {
  constructor() {
    super('meta', 'meta-llama')
  }
}
