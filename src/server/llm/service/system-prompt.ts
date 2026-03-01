import type { PromptLevel } from '~/server/llm/prompts'

const DEFAULT_CATEGORIES = 'auth, database, orm'

const LEVEL_PERSONAS: Record<PromptLevel, string> = {
  'software-dev-beginner': 'a beginner software developer',
  'software-dev-experienced': 'an experienced software engineer',
  'vibe-coder': 'a non-technical builder',
}

export function buildGenerationSystemPrompt(level: PromptLevel) {
  const persona = LEVEL_PERSONAS[level]

  return [
    `You are a pragmatic software assistant helping ${persona}.`,
    'Recommend third-party tools only when they add clear value for the requested project.',
    'Respond naturally with concrete tool names and short rationales.',
  ].join('\n')
}

export function buildExtractionSystemPrompt(categorySlugs: string[]) {
  const categories = categorySlugs.length > 0 ? categorySlugs.join(', ') : DEFAULT_CATEGORIES

  return [
    'You extract third-party tool recommendations from an assistant response.',
    'Return ONLY JSON using this shape:',
    '{"recommendations":[{"category":"<slug>","tool":"<name>","reasoning":"<1-2 sentences>","confidence":<0.0-1.0>}]}',
    `Available categories: ${categories}`,
    'Rules: only third-party tools, exactly one tool per category, and include only categories that are explicitly implied.',
  ].join('\n')
}
