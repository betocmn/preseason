import './src/env.js'

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  // Force metadata into <head> for all user agents so link unfurlers always see OG tags.
  htmlLimitedBots: /.*/,
  images: {
    formats: ['image/avif', 'image/webp'],
    imageSizes: [16, 32, 48, 64, 96, 128],
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
