import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Avatar, AvatarFallback, AvatarImage, shouldOptimizeAvatarSrc } from './avatar'

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

describe('Avatar initial render', () => {
  it('keeps the image hidden until it has loaded', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        Avatar,
        null,
        React.createElement(AvatarImage, { src: '/logos/tool.png', alt: 'Tool', size: 20 }),
        React.createElement(AvatarFallback, null, 'TT'),
      ),
    )

    expect(html).toContain('absolute inset-0 aspect-square h-full w-full opacity-0')
    expect(html).toContain('TT')
  })
})
