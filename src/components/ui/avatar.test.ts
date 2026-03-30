import { describe, expect, it } from 'vitest'
import { shouldOptimizeAvatarSrc } from './avatar'

describe('shouldOptimizeAvatarSrc', () => {
  it('optimizes local public assets', () => {
    expect(shouldOptimizeAvatarSrc('/logos/tool.png')).toBe(true)
  })

  it('does not optimize remote https avatars', () => {
    expect(shouldOptimizeAvatarSrc('https://example.com/avatar.png')).toBe(false)
  })

  it('does not optimize remote http avatars', () => {
    expect(shouldOptimizeAvatarSrc('http://example.com/avatar.png')).toBe(false)
  })

  it('does not optimize missing values', () => {
    expect(shouldOptimizeAvatarSrc(undefined)).toBe(false)
  })
})
