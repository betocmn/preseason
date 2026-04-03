export const PROMPT_CAROUSEL_TOP_TOOL_SLOT_COUNT = 4

export function getPromptTopToolSlots<T>(topTools: T[]) {
  return Array.from(
    { length: PROMPT_CAROUSEL_TOP_TOOL_SLOT_COUNT },
    (_, index) => topTools[index] ?? null,
  )
}
