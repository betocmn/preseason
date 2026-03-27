import { describe, expect, it } from 'vitest'
import {
  backgroundSmokePromptSlugs,
  selectBackgroundSmokePromptRows,
} from './background-smoke-prompts'

describe('backgroundSmokePromptSlugs', () => {
  it('keeps the configured prompt slug set stable', () => {
    expect(backgroundSmokePromptSlugs).toEqual(['real-estate-website', 'chat-application'])
  })
})

describe('selectBackgroundSmokePromptRows', () => {
  it('selects the configured slug and level pairs when seasons contain multiple levels', () => {
    const rows = [
      { slug: 'chat-application', level: 'advanced', marker: 'skip-chat-advanced' },
      { slug: 'real-estate-website', level: 'beginner', marker: 'keep-real-estate-beginner' },
      { slug: 'chat-application', level: 'beginner', marker: 'keep-chat-beginner' },
      {
        slug: 'real-estate-website',
        level: 'intermediate',
        marker: 'skip-real-estate-intermediate',
      },
    ]

    expect(selectBackgroundSmokePromptRows(rows)).toEqual([
      {
        slug: 'real-estate-website',
        level: 'beginner',
        marker: 'keep-real-estate-beginner',
      },
      { slug: 'chat-application', level: 'beginner', marker: 'keep-chat-beginner' },
    ])
  })

  it('throws when a configured slug and level fixture is missing', () => {
    expect(() =>
      selectBackgroundSmokePromptRows([
        { slug: 'real-estate-website', level: 'beginner', marker: 'keep-real-estate-beginner' },
      ]),
    ).toThrow('chat-application')
  })

  it('throws when more than one row matches the same configured slug and level pair', () => {
    expect(() =>
      selectBackgroundSmokePromptRows([
        { slug: 'real-estate-website', level: 'beginner', marker: 'duplicate-a' },
        { slug: 'real-estate-website', level: 'beginner', marker: 'duplicate-b' },
        { slug: 'chat-application', level: 'beginner', marker: 'keep-chat-beginner' },
      ]),
    ).toThrow('real-estate-website')
  })
})
