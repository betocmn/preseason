import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_SQUARE_SIZE = { width: 600, height: 600 }
export const OG_CONTENT_TYPE = 'image/png'

async function getMark() {
  const buffer = await readFile(join(process.cwd(), 'public', 'favicon', 'favicon.svg'))
  return `data:image/svg+xml;base64,${buffer.toString('base64')}`
}

export async function createHomepageOgImage(format: 'square' | 'wide') {
  const square = format === 'square'
  const mark = await getMark()
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: square ? 48 : 64,
        background: '#111318',
        color: '#f5f6fa',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* biome-ignore lint/performance/noImgElement: ImageResponse renders SVG, not browser markup. */}
        <img src={mark} width={square ? 56 : 52} height={square ? 56 : 52} alt="" />
        <span style={{ fontSize: square ? 30 : 32, fontWeight: 700, letterSpacing: -1 }}>
          Preseason
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: square ? 20 : 24 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: square ? 61 : 88,
            fontWeight: 700,
            letterSpacing: square ? -3 : -4,
            lineHeight: 1.05,
          }}
        >
          <span>The devtools</span>
          <span>AI chooses.</span>
        </div>
        <span style={{ fontSize: square ? 23 : 28, color: '#a3acbc' }}>
          LLM recommendations, ranked.
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #2b303a',
          paddingTop: 22,
          fontSize: square ? 20 : 22,
          color: '#a3acbc',
        }}
      >
        <span>{square ? 'preseason.ai' : 'Claude · GPT · Gemini · DeepSeek · Kimi'}</span>
        {!square && <span>preseason.ai</span>}
      </div>
    </div>,
    square ? OG_SQUARE_SIZE : OG_SIZE,
  )
}

export async function createOgImage(title?: string, subtitle?: string) {
  const mark = await getMark()
  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: 64,
        background: '#111318',
        color: '#f5f6fa',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* biome-ignore lint/performance/noImgElement: ImageResponse renders SVG, not browser markup. */}
        <img src={mark} width={52} height={52} alt="" />
        <span style={{ fontSize: 32, fontWeight: 700 }}>Preseason</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <span
          style={{
            fontSize: title && title.length > 40 ? 48 : 72,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -2,
          }}
        >
          {title ?? 'The devtools AI chooses.'}
        </span>
        {subtitle && (
          <span style={{ fontSize: 26, lineHeight: 1.4, color: '#a3acbc' }}>{subtitle}</span>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: '1px solid #2b303a',
          paddingTop: 22,
          fontSize: 22,
          color: '#a3acbc',
        }}
      >
        <span>LLM recommendations, ranked.</span>
        <span>preseason.ai</span>
      </div>
    </div>,
    OG_SIZE,
  )
}
