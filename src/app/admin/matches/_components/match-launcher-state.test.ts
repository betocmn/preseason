import { describe, expect, it } from 'vitest'
import {
  canonicalizeMatchLaunchKey,
  createClientUuid,
  stripMatchLaunchRows,
  validateMatchLaunchRows,
} from './match-launcher-state'

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('match launcher state', () => {
  it('prefers the platform randomUUID helper when available', () => {
    expect(
      createClientUuid({
        randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
      }),
    ).toBe('123e4567-e89b-42d3-a456-426614174000')
  })

  it('builds a UUID from getRandomValues when randomUUID is unavailable', () => {
    const uuid = createClientUuid({
      getRandomValues: (array) => {
        array.set([
          0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e,
          0x0f,
        ])
        return array
      },
    })

    expect(uuid).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })

  it('falls back to a UUID-shaped string when browser crypto helpers are unavailable', () => {
    expect(createClientUuid(undefined)).toMatch(UUID_V4_PATTERN)
  })

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
