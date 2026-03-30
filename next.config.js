import './src/env.js'

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    imageSizes: [16, 32, 48, 64, 96, 128],
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  outputFileTracingIncludes: {
    '/*': ['./src/server/llm/prompts/**/*.md'],
  },
  async rewrites() {
    return [
      {
        source: '/beto-admin/:path*',
        destination: '/admin/:path*',
      },
    ]
  },
}

export default config
