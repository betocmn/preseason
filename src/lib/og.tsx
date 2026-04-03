import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

export const OG_SIZE = { width: 1200, height: 630 }

export const OG_CONTENT_TYPE = 'image/png'

async function getLogoBase64() {
  const logoPath = join(process.cwd(), 'public', 'preseason-brand', 'preseason-logo-cropped.png')
  const buffer = await readFile(logoPath)
  return `data:image/png;base64,${buffer.toString('base64')}`
}

export async function createOgImage(title: string, subtitle?: string) {
  const logoSrc = await getLogoBase64()

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'linear-gradient(135deg, #0f1218 0%, #141a24 40%, #181f2e 100%)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Gradient accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '6px',
          background: 'linear-gradient(90deg, #73edff, #5a93ff, #aa9fff, #73edff)',
        }}
      />

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          padding: '0 80px',
        }}
      >
        {/* Logo — next/image cannot be used in OG image generation */}
        {/* biome-ignore lint/performance/noImgElement: OG images use Satori, not the browser */}
        <img src={logoSrc} width={290} height={80} alt="Preseason" />

        {/* Title */}
        <div
          style={{
            fontSize: title.length > 40 ? 44 : 56,
            fontWeight: 700,
            color: '#f0f2f5',
            textAlign: 'center',
            lineHeight: 1.2,
            maxWidth: '900px',
          }}
        >
          {title}
        </div>

        {/* Subtitle */}
        {subtitle && (
          <div
            style={{
              fontSize: 24,
              color: '#8b95a5',
              textAlign: 'center',
              lineHeight: 1.4,
              maxWidth: '700px',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>

      {/* Footer branding */}
      <div
        style={{
          position: 'absolute',
          bottom: '40px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: 20,
          color: '#5a6577',
        }}
      >
        preseason.ai
      </div>
    </div>,
    OG_SIZE,
  )
}
