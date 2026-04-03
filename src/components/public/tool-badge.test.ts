import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ToolBadge } from './tool-badge'

describe('ToolBadge', () => {
  it('passes eager loading to the logo image when requested', () => {
    const html = renderToStaticMarkup(
      React.createElement(ToolBadge, {
        name: 'Stripe',
        slug: 'stripe',
        logoUrl: '/logos/stripe.png',
        size: 'sm',
        imageLoading: 'eager',
      }),
    )

    expect(html).toContain('loading="eager"')
  })
})
