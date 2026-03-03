import './src/env.js'

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
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
