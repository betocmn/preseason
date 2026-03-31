import { describe, expect, it } from 'vitest'
import { isCronRequestAuthorized } from './cron-auth'

describe('isCronRequestAuthorized', () => {
  it('returns false when expected token is missing', () => {
    const request = new Request('http://localhost', {
      headers: { authorization: 'Bearer token' },
    })

    expect(isCronRequestAuthorized(request, undefined)).toBe(false)
  })

  it('returns false when bearer token is missing', () => {
    const request = new Request('http://localhost')

    expect(isCronRequestAuthorized(request, 'token')).toBe(false)
  })

  it('returns false when bearer token is empty', () => {
    const request = new Request('http://localhost', {
      headers: { authorization: 'Bearer   ' },
    })

    expect(isCronRequestAuthorized(request, 'token')).toBe(false)
  })

  it('returns false when token lengths differ', () => {
    const request = new Request('http://localhost', {
      headers: { authorization: 'Bearer short' },
    })

    expect(isCronRequestAuthorized(request, 'a-longer-token')).toBe(false)
  })

  it('returns false when token value differs', () => {
    const request = new Request('http://localhost', {
      headers: { authorization: 'Bearer token-a' },
    })

    expect(isCronRequestAuthorized(request, 'token-b')).toBe(false)
  })

  it('returns true when tokens match exactly', () => {
    const request = new Request('http://localhost', {
      headers: { authorization: 'Bearer token' },
    })

    expect(isCronRequestAuthorized(request, 'token')).toBe(true)
  })
})
