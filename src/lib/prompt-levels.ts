const PROMPT_LEVEL_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

const PROMPT_LEVEL_CLASSES: Record<string, string> = {
  beginner: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  intermediate: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  advanced: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
}

export function formatPromptLevel(level: string): string {
  return PROMPT_LEVEL_LABELS[level] ?? level.charAt(0).toUpperCase() + level.slice(1)
}

export function promptLevelClass(level: string): string {
  return PROMPT_LEVEL_CLASSES[level] ?? ''
}
