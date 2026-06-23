export const CATALOG_PROVIDER_IDS = [
  'anthropic',
  'openai',
  'google',
  'meta',
  'mistral',
  'deepseek',
  'zai',
  'minimax',
  'xiaomi',
  'moonshotai',
  'qwen',
] as const

export type CatalogProviderId = (typeof CATALOG_PROVIDER_IDS)[number]
export type ModelTier = 'frontier' | 'mid' | 'small'

export type ProviderConfig = {
  id: CatalogProviderId
  namespace: string
  company: string
  aliases: string[]
}

export type LlmCatalogEntry = {
  name: string
  slug: string
  provider: CatalogProviderId
  company: string
  modelFamily: string
  modelVersion: string
  modelId: string
  tier: ModelTier
  /**
   * Superseded models are kept in the catalog (never deleted) so their historical
   * benchmark data keeps counting. Archived entries seed with `isActive = false`,
   * which excludes them from new benchmark seasons while preserving past results,
   * and surfaces them under the "Archived" group in the model-version dropdown.
   */
  archived?: boolean
}

export const PROVIDER_REGISTRY: Record<CatalogProviderId, ProviderConfig> = {
  anthropic: {
    id: 'anthropic',
    namespace: 'anthropic',
    company: 'Anthropic',
    aliases: ['anthropic', 'claude'],
  },
  openai: {
    id: 'openai',
    namespace: 'openai',
    company: 'OpenAI',
    aliases: ['openai', 'gpt', 'codex'],
  },
  google: {
    id: 'google',
    namespace: 'google',
    company: 'Google',
    aliases: ['google', 'gemini'],
  },
  meta: {
    id: 'meta',
    namespace: 'meta-llama',
    company: 'Meta',
    aliases: ['meta', 'metallama', 'llama'],
  },
  mistral: {
    id: 'mistral',
    namespace: 'mistralai',
    company: 'Mistral AI',
    aliases: ['mistral', 'mistralai'],
  },
  deepseek: {
    id: 'deepseek',
    namespace: 'deepseek',
    company: 'DeepSeek',
    aliases: ['deepseek'],
  },
  zai: {
    id: 'zai',
    namespace: 'z-ai',
    company: 'Z.ai',
    aliases: ['zai', 'z-ai', 'glm'],
  },
  minimax: {
    id: 'minimax',
    namespace: 'minimax',
    company: 'MiniMax',
    aliases: ['minimax'],
  },
  xiaomi: {
    id: 'xiaomi',
    namespace: 'xiaomi',
    company: 'Xiaomi',
    aliases: ['xiaomi', 'mimo'],
  },
  moonshotai: {
    id: 'moonshotai',
    namespace: 'moonshotai',
    company: 'MoonshotAI',
    aliases: ['moonshot', 'moonshotai', 'kimi'],
  },
  qwen: {
    id: 'qwen',
    namespace: 'qwen',
    company: 'Qwen',
    aliases: ['qwen', 'alibaba'],
  },
}

export const CURATED_LLM_CATALOG: LlmCatalogEntry[] = [
  {
    name: 'GPT 5.5',
    slug: 'gpt-5-5',
    provider: 'openai',
    company: 'OpenAI',
    modelFamily: 'GPT',
    modelVersion: '5.5',
    modelId: 'openai/gpt-5.5',
    tier: 'frontier',
  },
  {
    name: 'GPT 5.4',
    slug: 'gpt-5-4',
    provider: 'openai',
    company: 'OpenAI',
    modelFamily: 'GPT',
    modelVersion: '5.4',
    modelId: 'openai/gpt-5.4',
    tier: 'frontier',
    archived: true,
  },
  {
    name: 'GPT 5.4 Mini',
    slug: 'gpt-5-4-mini',
    provider: 'openai',
    company: 'OpenAI',
    modelFamily: 'GPT Mini',
    modelVersion: '5.4',
    modelId: 'openai/gpt-5.4-mini',
    tier: 'mid',
  },
  {
    name: 'GPT 5.3 Codex',
    slug: 'gpt-5-3-codex',
    provider: 'openai',
    company: 'OpenAI',
    modelFamily: 'Codex',
    modelVersion: '5.3',
    modelId: 'openai/gpt-5.3-codex',
    tier: 'frontier',
  },
  {
    name: 'Claude Opus 4.8',
    slug: 'claude-opus-4-8',
    provider: 'anthropic',
    company: 'Anthropic',
    modelFamily: 'Opus',
    modelVersion: '4.8',
    modelId: 'anthropic/claude-opus-4.8',
    tier: 'frontier',
  },
  {
    name: 'Claude Opus 4.6',
    slug: 'claude-opus-4-6',
    provider: 'anthropic',
    company: 'Anthropic',
    modelFamily: 'Opus',
    modelVersion: '4.6',
    modelId: 'anthropic/claude-opus-4.6',
    tier: 'frontier',
    archived: true,
  },
  {
    name: 'Claude Sonnet 4.6',
    slug: 'claude-sonnet-4-6',
    provider: 'anthropic',
    company: 'Anthropic',
    modelFamily: 'Sonnet',
    modelVersion: '4.6',
    modelId: 'anthropic/claude-sonnet-4.6',
    tier: 'frontier',
  },
  {
    name: 'Claude Haiku 4.5',
    slug: 'claude-haiku-4-5',
    provider: 'anthropic',
    company: 'Anthropic',
    modelFamily: 'Haiku',
    modelVersion: '4.5',
    modelId: 'anthropic/claude-haiku-4.5',
    tier: 'small',
  },
  {
    name: 'Gemini 2.5 Pro',
    slug: 'gemini-2-5-pro',
    provider: 'google',
    company: 'Google',
    modelFamily: 'Gemini Pro',
    modelVersion: '2.5',
    modelId: 'google/gemini-2.5-pro',
    tier: 'frontier',
  },
  {
    name: 'Gemini 3.5 Flash',
    slug: 'gemini-3-5-flash',
    provider: 'google',
    company: 'Google',
    modelFamily: 'Gemini Flash',
    modelVersion: '3.5',
    modelId: 'google/gemini-3.5-flash',
    tier: 'small',
  },
  {
    name: 'Gemini 2.5 Flash',
    slug: 'gemini-2-5-flash',
    provider: 'google',
    company: 'Google',
    modelFamily: 'Gemini Flash',
    modelVersion: '2.5',
    modelId: 'google/gemini-2.5-flash',
    tier: 'small',
    archived: true,
  },
  {
    name: 'Llama 4 Maverick',
    slug: 'llama-4-maverick',
    provider: 'meta',
    company: 'Meta',
    modelFamily: 'Llama Maverick',
    modelVersion: '4',
    modelId: 'meta-llama/llama-4-maverick',
    tier: 'frontier',
  },
  {
    name: 'Llama 4 Scout',
    slug: 'llama-4-scout',
    provider: 'meta',
    company: 'Meta',
    modelFamily: 'Llama Scout',
    modelVersion: '4',
    modelId: 'meta-llama/llama-4-scout',
    tier: 'small',
  },
  {
    name: 'Mistral Small 4',
    slug: 'mistral-small-4',
    provider: 'mistral',
    company: 'Mistral AI',
    modelFamily: 'Mistral Small',
    modelVersion: '4',
    modelId: 'mistralai/mistral-small-2603',
    tier: 'mid',
  },
  {
    name: 'Devstral 2 2512',
    slug: 'devstral-2-2512',
    provider: 'mistral',
    company: 'Mistral AI',
    modelFamily: 'Devstral',
    modelVersion: '2 2512',
    modelId: 'mistralai/devstral-2512',
    tier: 'mid',
  },
  {
    name: 'DeepSeek V4 Pro',
    slug: 'deepseek-v4-pro',
    provider: 'deepseek',
    company: 'DeepSeek',
    modelFamily: 'DeepSeek V',
    modelVersion: '4 Pro',
    modelId: 'deepseek/deepseek-v4-pro',
    tier: 'frontier',
  },
  {
    name: 'DeepSeek V4 Flash',
    slug: 'deepseek-v4-flash',
    provider: 'deepseek',
    company: 'DeepSeek',
    modelFamily: 'DeepSeek V',
    modelVersion: '4 Flash',
    modelId: 'deepseek/deepseek-v4-flash',
    tier: 'mid',
  },
  {
    name: 'DeepSeek V3.2',
    slug: 'deepseek-v3-2',
    provider: 'deepseek',
    company: 'DeepSeek',
    modelFamily: 'DeepSeek V',
    modelVersion: '3.2',
    modelId: 'deepseek/deepseek-v3.2',
    tier: 'mid',
    archived: true,
  },
  {
    name: 'DeepSeek R1 0528',
    slug: 'deepseek-r1-0528',
    provider: 'deepseek',
    company: 'DeepSeek',
    modelFamily: 'R1',
    modelVersion: '0528',
    modelId: 'deepseek/deepseek-r1-0528',
    tier: 'frontier',
  },
  {
    name: 'GLM 5.2',
    slug: 'glm-5-2',
    provider: 'zai',
    company: 'Z.ai',
    modelFamily: 'GLM',
    modelVersion: '5.2',
    modelId: 'z-ai/glm-5.2',
    tier: 'frontier',
  },
  {
    name: 'GLM 5 Turbo',
    slug: 'glm-5-turbo',
    provider: 'zai',
    company: 'Z.ai',
    modelFamily: 'GLM',
    modelVersion: '5 Turbo',
    modelId: 'z-ai/glm-5-turbo',
    tier: 'frontier',
    archived: true,
  },
  {
    name: 'MiniMax M3',
    slug: 'minimax-m3',
    provider: 'minimax',
    company: 'MiniMax',
    modelFamily: 'MiniMax M',
    modelVersion: '3',
    modelId: 'minimax/minimax-m3',
    tier: 'frontier',
  },
  {
    name: 'MiniMax M2.7',
    slug: 'minimax-m2-7',
    provider: 'minimax',
    company: 'MiniMax',
    modelFamily: 'MiniMax M',
    modelVersion: '2.7',
    modelId: 'minimax/minimax-m2.7',
    tier: 'frontier',
    archived: true,
  },
  {
    name: 'MiMo V2.5 Pro',
    slug: 'mimo-v2-5-pro',
    provider: 'xiaomi',
    company: 'Xiaomi',
    modelFamily: 'MiMo V2',
    modelVersion: '2.5 Pro',
    modelId: 'xiaomi/mimo-v2.5-pro',
    tier: 'frontier',
  },
  {
    name: 'MiMo V2 Pro',
    slug: 'mimo-v2-pro',
    provider: 'xiaomi',
    company: 'Xiaomi',
    modelFamily: 'MiMo V2',
    modelVersion: 'Pro',
    modelId: 'xiaomi/mimo-v2-pro',
    tier: 'frontier',
    archived: true,
  },
  {
    name: 'Kimi K2.7 Code',
    slug: 'kimi-k2-7-code',
    provider: 'moonshotai',
    company: 'MoonshotAI',
    modelFamily: 'Kimi K',
    modelVersion: '2.7 Code',
    modelId: 'moonshotai/kimi-k2.7-code',
    tier: 'frontier',
  },
  {
    name: 'Kimi K2.5',
    slug: 'kimi-k2-5',
    provider: 'moonshotai',
    company: 'MoonshotAI',
    modelFamily: 'Kimi K',
    modelVersion: '2.5',
    modelId: 'moonshotai/kimi-k2.5',
    tier: 'frontier',
    archived: true,
  },
  {
    name: 'Qwen3 Coder Next',
    slug: 'qwen3-coder-next',
    provider: 'qwen',
    company: 'Qwen',
    modelFamily: 'Qwen3 Coder',
    modelVersion: 'Next',
    modelId: 'qwen/qwen3-coder-next',
    tier: 'mid',
  },
]

function normalizeValue(value: string) {
  return value.trim().toLowerCase()
}

export function normalizeProviderToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

export const PROVIDER_ALIAS_MAP: Record<string, CatalogProviderId> = Object.values(
  PROVIDER_REGISTRY,
).reduce<Record<string, CatalogProviderId>>((acc, config) => {
  for (const alias of config.aliases) {
    acc[normalizeProviderToken(alias)] = config.id
  }
  acc[normalizeProviderToken(config.id)] = config.id
  acc[normalizeProviderToken(config.namespace)] = config.id
  return acc
}, {})

const CATALOG_BY_MODEL_ID = new Map(
  CURATED_LLM_CATALOG.map((entry) => [normalizeValue(entry.modelId), entry]),
)

const CATALOG_BY_SLUG = new Map(CURATED_LLM_CATALOG.map((entry) => [entry.slug, entry]))

export function getCatalogLlmByModelId(modelId: string) {
  return CATALOG_BY_MODEL_ID.get(normalizeValue(modelId))
}

export function getCatalogLlmBySlug(slug: string) {
  return CATALOG_BY_SLUG.get(slug)
}
