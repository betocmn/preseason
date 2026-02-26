import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl/middleware', () => ({
  default: () => {
    // Return a function that simulates next-intl middleware (returns a response)
    return (request: NextRequest) => {
      return NextResponse.next({ request })
    }
  },
}))

vi.mock('~/lib/supabase/middleware', () => ({
  updateSession: vi.fn(),
}))

import { updateSession } from '~/lib/supabase/middleware'
import { middleware } from '~/middleware'

const mockUpdateSession = vi.mocked(updateSession)

function createRequest(path: string) {
  return new NextRequest(new URL(path, 'http://localhost:3000'))
}

function getRedirectLocation(response: Response): URL {
  const locationHeader = response.headers.get('location')
  expect(locationHeader).toBeTruthy()
  return new URL(locationHeader as string)
}

describe('Middleware', () => {
  beforeEach(() => {
    mockUpdateSession.mockReset()
  })

  it('should redirect unauthenticated users to login for protected routes', async () => {
    mockUpdateSession.mockResolvedValue({
      supabaseResponse: NextResponse.next(),
      user: null,
    })

    const response = await middleware(createRequest('/en/dashboard'))

    expect(response.status).toBe(307)
    const location = getRedirectLocation(response)
    expect(location.pathname).toBe('/en/login')
    expect(location.searchParams.get('redirectTo')).toBe('/dashboard')
  })

  it('should preserve the original path in redirectTo param', async () => {
    mockUpdateSession.mockResolvedValue({
      supabaseResponse: NextResponse.next(),
      user: null,
    })

    const response = await middleware(createRequest('/en/profile'))

    expect(response.status).toBe(307)
    const location = getRedirectLocation(response)
    expect(location.pathname).toBe('/en/login')
    expect(location.searchParams.get('redirectTo')).toBe('/profile')
  })

  it('should allow unauthenticated access to /login', async () => {
    mockUpdateSession.mockResolvedValue({
      supabaseResponse: NextResponse.next(),
      user: null,
    })

    const response = await middleware(createRequest('/en/login'))

    // Should not redirect (not a 307)
    expect(response.status).not.toBe(307)
  })

  it('should allow unauthenticated access to /signup', async () => {
    mockUpdateSession.mockResolvedValue({
      supabaseResponse: NextResponse.next(),
      user: null,
    })

    const response = await middleware(createRequest('/en/signup'))

    expect(response.status).not.toBe(307)
  })

  it('should redirect authenticated users from /login to /', async () => {
    mockUpdateSession.mockResolvedValue({
      supabaseResponse: NextResponse.next(),
      // biome-ignore lint/suspicious/noExplicitAny: mock Supabase user for testing
      user: { id: 'test-user-id' } as any,
    })

    const response = await middleware(createRequest('/en/login'))

    expect(response.status).toBe(307)
    const location = getRedirectLocation(response)
    expect(location.pathname).toMatch(/^\/en\/?$/)
  })

  it('should redirect authenticated users from /signup to /', async () => {
    mockUpdateSession.mockResolvedValue({
      supabaseResponse: NextResponse.next(),
      // biome-ignore lint/suspicious/noExplicitAny: mock Supabase user for testing
      user: { id: 'test-user-id' } as any,
    })

    const response = await middleware(createRequest('/en/signup'))

    expect(response.status).toBe(307)
    const location = getRedirectLocation(response)
    expect(location.pathname).toMatch(/^\/en\/?$/)
  })

  it('should allow authenticated access to protected routes', async () => {
    mockUpdateSession.mockResolvedValue({
      supabaseResponse: NextResponse.next(),
      // biome-ignore lint/suspicious/noExplicitAny: mock Supabase user for testing
      user: { id: 'test-user-id' } as any,
    })

    const response = await middleware(createRequest('/en/dashboard'))

    // Should not redirect
    expect(response.status).not.toBe(307)
  })

  it('should handle Bulgarian locale prefix', async () => {
    mockUpdateSession.mockResolvedValue({
      supabaseResponse: NextResponse.next(),
      user: null,
    })

    const response = await middleware(createRequest('/bg/profile'))

    expect(response.status).toBe(307)
    const location = getRedirectLocation(response)
    expect(location.pathname).toBe('/bg/login')
  })
})
