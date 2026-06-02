import { describe, expect, it } from 'vitest'
import { fingerprintToolText, normalizeToolText } from './tool-normalization'

describe('tool-normalization', () => {
  it('preserves existing exact normalization', () => {
    expect(normalizeToolText('  Clerk.Dev  ')).toBe('clerk.dev')
  })

  it('strips common host suffixes for fingerprints', () => {
    expect(fingerprintToolText('Clerk.dev')).toBe('clerk')
    expect(fingerprintToolText('https://www.algolia.com')).toBe('algolia')
  })

  it('drops parenthetical acronyms from fingerprints', () => {
    expect(fingerprintToolText('Firebase Cloud Messaging (FCM)')).toBe('firebase cloud messaging')
  })

  it('splits punctuation variants into stable tokens', () => {
    expect(fingerprintToolText('react-query')).toBe('react query')
  })
})
