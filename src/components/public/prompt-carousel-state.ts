type PromptAdvanceParams = {
  currentIndex: number
  loadedPromptCount: number
  fetchedPromptCount: number
}

type PromptPrefetchParams = {
  nextIndex: number
  loadedPromptCount: number
  hasMore: boolean
  isLoadingMore: boolean
}

const PROMPT_PREFETCH_THRESHOLD = 2

export function getNextPromptIndexAfterLoad({
  currentIndex,
  loadedPromptCount,
  fetchedPromptCount,
}: PromptAdvanceParams) {
  const nextIndex = currentIndex + 1

  if (nextIndex < loadedPromptCount) {
    return nextIndex
  }

  return fetchedPromptCount > 0 ? nextIndex : currentIndex
}

export function shouldPrefetchPromptPage({
  nextIndex,
  loadedPromptCount,
  hasMore,
  isLoadingMore,
}: PromptPrefetchParams) {
  return hasMore && !isLoadingMore && nextIndex >= loadedPromptCount - PROMPT_PREFETCH_THRESHOLD
}
