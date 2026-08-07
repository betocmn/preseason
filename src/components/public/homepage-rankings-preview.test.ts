import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomepageRankingsPreview } from './homepage-rankings-preview'

describe('HomepageRankingsPreview', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gives each ranking link a category-specific accessible name', () => {
    vi.stubGlobal('React', React)
    const html = renderToStaticMarkup(
      React.createElement(HomepageRankingsPreview, {
        previews: [
          { slug: 'auth', name: 'Authentication', groupSlug: 'devtools', ranking: null },
          { slug: 'database', name: 'Database', groupSlug: 'devtools', ranking: null },
        ],
      }),
    )

    expect(html).toContain('aria-label="View Authentication rankings"')
    expect(html).toContain('aria-label="View Database rankings"')
  })
})
