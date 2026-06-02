import { describe, expect, it } from 'vitest'
import {
  getNextPromptIndexAfterLoad,
  getPromptNextButtonState,
  shouldPrefetchPromptPage,
} from './prompt-carousel-state'

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

describe('getPromptNextButtonState', () => {
  it('keeps next enabled while a background prefetch runs and a loaded prompt remains', () => {
    expect(
      getPromptNextButtonState({
        currentIndex: 3,
        loadedPromptCount: 5,
        hasMore: true,
        isLoadingMore: true,
      }),
    ).toEqual({
      disabled: false,
      showLoadingState: false,
    })
  })

  it('shows loading state only when the next prompt depends on the in-flight page', () => {
    expect(
      getPromptNextButtonState({
        currentIndex: 4,
        loadedPromptCount: 5,
        hasMore: true,
        isLoadingMore: true,
      }),
    ).toEqual({
      disabled: false,
      showLoadingState: true,
    })
  })

  it('disables next once no loaded prompts or later pages remain', () => {
    expect(
      getPromptNextButtonState({
        currentIndex: 4,
        loadedPromptCount: 5,
        hasMore: false,
        isLoadingMore: false,
      }),
    ).toEqual({
      disabled: true,
      showLoadingState: false,
    })
  })
})
