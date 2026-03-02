import './src/env.js'

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
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
