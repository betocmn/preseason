import { describe, expect, it } from 'vitest'
import { getNextPromptIndexAfterLoad, shouldPrefetchPromptPage } from './prompt-carousel-state'

describe('getNextPromptIndexAfterLoad', () => {
  it('advances within already loaded prompts', () => {
    expect(
      getNextPromptIndexAfterLoad({
        currentIndex: 1,
        loadedPromptCount: 5,
        fetchedPromptCount: 0,
      }),
    ).toBe(2)
  })

  it('advances into the first newly loaded prompt at the boundary', () => {
    expect(
      getNextPromptIndexAfterLoad({
        currentIndex: 4,
        loadedPromptCount: 5,
        fetchedPromptCount: 5,
      }),
    ).toBe(5)
  })

  it('stays on the current prompt when a boundary load returns nothing', () => {
    expect(
      getNextPromptIndexAfterLoad({
        currentIndex: 4,
        loadedPromptCount: 5,
        fetchedPromptCount: 0,
      }),
    ).toBe(4)
  })
})

describe('shouldPrefetchPromptPage', () => {
  it('prefetches when the user nears the end of loaded prompts', () => {
    expect(
      shouldPrefetchPromptPage({
        nextIndex: 3,
        loadedPromptCount: 5,
        hasMore: true,
        isLoadingMore: false,
      }),
    ).toBe(true)
  })

  it('does not prefetch while a page is already loading', () => {
    expect(
      shouldPrefetchPromptPage({
        nextIndex: 3,
        loadedPromptCount: 5,
        hasMore: true,
        isLoadingMore: true,
      }),
    ).toBe(false)
  })

  it('does not prefetch when there are no more prompts to load', () => {
    expect(
      shouldPrefetchPromptPage({
        nextIndex: 3,
        loadedPromptCount: 5,
        hasMore: false,
        isLoadingMore: false,
      }),
    ).toBe(false)
  })
})
