export type ModelTier = 'frontier' | 'mid' | 'small'

type TierRule = { pattern: string; tier: ModelTier }

const MODEL_TIER_RULES: TierRule[] = [
  // Frontier
  { pattern: 'claude-3-opus', tier: 'frontier' },
  { pattern: 'claude-3.5-opus', tier: 'frontier' },
  { pattern: 'claude-4-opus', tier: 'frontier' },
  { pattern: 'gpt-4o', tier: 'frontier' },
  { pattern: 'gpt-4-turbo', tier: 'frontier' },
  { pattern: 'gemini-1.5-pro', tier: 'frontier' },
  { pattern: 'gemini-pro-1.5', tier: 'frontier' },
  { pattern: 'gemini-2.0-pro', tier: 'frontier' },

  // Mid (order matters: gpt-4o-mini must be checked before gpt-4o above,
  // but since we match the first rule and gpt-4o-mini contains "gpt-4o",
  // we place the more-specific mini rule first)
  { pattern: 'gpt-4o-mini', tier: 'mid' },
  { pattern: 'claude-3-sonnet', tier: 'mid' },
  { pattern: 'claude-3.5-sonnet', tier: 'mid' },
  { pattern: 'claude-3.7-sonnet', tier: 'mid' },
  { pattern: 'claude-4-sonnet', tier: 'mid' },
  { pattern: 'mistral-large', tier: 'mid' },

  // Small
  { pattern: 'llama-3.1-70b', tier: 'small' },
  { pattern: 'llama-3.3-70b', tier: 'small' },
  { pattern: 'deepseek-chat', tier: 'small' },
  { pattern: 'deepseek-v2', tier: 'small' },
  { pattern: 'deepseek-v3', tier: 'small' },
]

export function classifyModelTier(modelId: string): ModelTier {
  const normalized = modelId.toLowerCase()

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
