import { describe, expect, it } from 'vitest'
import { adminNavItems } from './admin-nav'

describe('adminNavItems', () => {
  it('includes the matches admin section', () => {
    expect(adminNavItems).toContainEqual(
      expect.objectContaining({
        href: '/beto-admin/matches',
        label: 'Matches',
      }),
    )
  })
})
