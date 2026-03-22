const PROMPT_LEVEL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

export function formatPromptLevel(level: string): string {
  return PROMPT_LEVEL_LABELS[level] ?? level.charAt(0).toUpperCase() + level.slice(1)
}
