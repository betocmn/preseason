import { describe, expect, it } from 'vitest'
import {
  canonicalizeMatchLaunchKey,
  stripMatchLaunchRows,
  validateMatchLaunchRows,
} from './match-launcher-state'

describe('match launcher state', () => {
  it('canonicalizes duplicate matchup keys regardless of tool order', () => {
    const toolAId = 'B0000000-0000-4000-8000-000000000001'
    const toolBId = 'a0000000-0000-4000-8000-000000000002'

    expect(canonicalizeMatchLaunchKey('cat-1', toolAId, toolBId)).toBe(
      canonicalizeMatchLaunchKey('cat-1', toolBId, toolAId),
    )
  })

  it('flags rows that choose the same tool twice', () => {
    const validation = validateMatchLaunchRows([
      {
        id: 'row-1',
        categoryId: 'cat-1',
        toolAId: 'tool-1',
        toolBId: 'tool-1',
      },
    ])

    expect(validation.canSubmit).toBe(false)
    expect(validation.rowErrors.get('row-1')).toMatchObject({
      toolBId: 'Choose two different tools',
    })
  })

  it('flags duplicate normalized rows in the same submission', () => {
    const validation = validateMatchLaunchRows([
      {
        id: 'row-1',
        categoryId: 'cat-1',
        toolAId: 'tool-a',
        toolBId: 'tool-b',
      },
      {
        id: 'row-2',
        categoryId: 'cat-1',
        toolAId: 'tool-b',
        toolBId: 'tool-a',
      },
    ])

    expect(validation.canSubmit).toBe(false)
    expect(validation.rowErrors.get('row-1')).toMatchObject({
      duplicate: 'This matchup is duplicated in the queue',
    })
    expect(validation.rowErrors.get('row-2')).toMatchObject({
      duplicate: 'This matchup is duplicated in the queue',
    })
  })

  it('strips client-only row ids before submission', () => {
    expect(
      stripMatchLaunchRows([
        {
          id: 'row-1',
          categoryId: 'cat-1',
          toolAId: 'tool-a',
          toolBId: 'tool-b',
        },
      ]),
    ).toEqual([
      {
        categoryId: 'cat-1',
        toolAId: 'tool-a',
        toolBId: 'tool-b',
      },
    ])
  })
})
