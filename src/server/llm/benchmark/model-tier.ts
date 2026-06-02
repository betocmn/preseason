import { getCatalogLlmByModelId, type ModelTier } from '~/server/llm/catalog'

export type { ModelTier } from '~/server/llm/catalog'

type TierRule = { pattern: string; tier: ModelTier }

const MODEL_TIER_RULES: TierRule[] = [
  // Frontier
  { pattern: 'gpt-5', tier: 'frontier' },
  { pattern: 'claude-3-opus', tier: 'frontier' },
  { pattern: 'claude-3.5-opus', tier: 'frontier' },
  { pattern: 'claude-4-opus', tier: 'frontier' },
  { pattern: 'claude-opus-4', tier: 'frontier' },
  { pattern: 'gpt-4o', tier: 'frontier' },
  { pattern: 'gpt-4-turbo', tier: 'frontier' },
  { pattern: 'gemini-1.5-pro', tier: 'frontier' },
  { pattern: 'gemini-pro-1.5', tier: 'frontier' },
  { pattern: 'gemini-2.0-pro', tier: 'frontier' },
  { pattern: 'gemini-2.5-pro', tier: 'frontier' },
  { pattern: 'llama-4-maverick', tier: 'frontier' },
  { pattern: 'deepseek-r1', tier: 'frontier' },
  { pattern: 'glm-5', tier: 'frontier' },
  { pattern: 'minimax-m2.7', tier: 'frontier' },
  { pattern: 'mimo-v2-pro', tier: 'frontier' },
  { pattern: 'kimi-k2.5', tier: 'frontier' },

  // Mid (order matters: gpt-4o-mini must be checked before gpt-4o above,
  // but since we match the first rule and gpt-4o-mini contains "gpt-4o",
  // we place the more-specific mini rule first)
  { pattern: 'gpt-5-mini', tier: 'mid' },
  { pattern: 'gpt-4o-mini', tier: 'mid' },
  { pattern: 'claude-3-sonnet', tier: 'mid' },
  { pattern: 'claude-3.5-sonnet', tier: 'mid' },
  { pattern: 'claude-3.7-sonnet', tier: 'mid' },
  { pattern: 'claude-4-sonnet', tier: 'mid' },
  { pattern: 'claude-sonnet-4', tier: 'mid' },
  { pattern: 'mistral-large', tier: 'mid' },
  { pattern: 'mistral-small', tier: 'mid' },
  { pattern: 'devstral', tier: 'mid' },
  { pattern: 'deepseek-v3', tier: 'mid' },
  { pattern: 'qwen3-coder-next', tier: 'mid' },

  // Small
  { pattern: 'claude-haiku-4.5', tier: 'small' },
  { pattern: 'llama-3.1-70b', tier: 'small' },
  { pattern: 'llama-3.3-70b', tier: 'small' },
  { pattern: 'llama-4-scout', tier: 'small' },
  { pattern: 'deepseek-chat', tier: 'small' },
  { pattern: 'deepseek-v2', tier: 'small' },
  { pattern: 'gemini-2.5-flash', tier: 'small' },
]

export function classifyModelTier(modelId: string): ModelTier {
  const normalized = modelId.toLowerCase()
  const exactMatch = getCatalogLlmByModelId(normalized)

  if (exactMatch) {
    return exactMatch.tier
  }

  // Check more-specific patterns first (e.g., gpt-4o-mini before gpt-4o)
  // Rules are ordered: mid-specifics first, then frontier, then small
  const midRules = MODEL_TIER_RULES.filter((r) => r.tier === 'mid')
  const otherRules = MODEL_TIER_RULES.filter((r) => r.tier !== 'mid')

  for (const rule of [...midRules, ...otherRules]) {
    if (normalized.includes(rule.pattern)) {
      return rule.tier
    }
  }

  return 'mid'
}

export function extractModelFamilyKey(modelId: string): string {
  const parts = modelId.split('/')
  const name = parts.length > 1 ? parts.slice(1).join('/') : modelId

  return name
    .replace(/:\w+$/, '')
    .replace(/@\w+$/, '')
    .replace(/-\d{4}-?\d{2}-?\d{2}$/, '')
    .toLowerCase()
}
