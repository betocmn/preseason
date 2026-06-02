import { describe, expect, it } from 'vitest'
import {
  getPromptTopToolSlots,
  PROMPT_CAROUSEL_TOP_TOOL_SLOT_COUNT,
} from './prompt-carousel-layout'

describe('getPromptTopToolSlots', () => {
  it('pads missing recommendation rows with null slots', () => {
    expect(getPromptTopToolSlots(['postgresql', 'auth0'])).toEqual([
      'postgresql',
      'auth0',
      null,
      null,
    ])
  })

  it('caps the rendered slots to the supported recommendation count', () => {
    const slots = getPromptTopToolSlots(['a', 'b', 'c', 'd', 'e'])

    expect(slots).toHaveLength(PROMPT_CAROUSEL_TOP_TOOL_SLOT_COUNT)
    expect(slots).toEqual(['a', 'b', 'c', 'd'])
  })
})
