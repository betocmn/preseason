import './src/env.js'

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  // Production builds prerender DB-backed pages against a cold database. Retrying after
  // the default 60s re-runs their queries while the abandoned attempt's are still running.
  staticPageGenerationTimeout: 180,
  images: {
    formats: ['image/avif', 'image/webp'],
    imageSizes: [16, 32, 48, 64, 96, 128],
  },
  outputFileTracingIncludes: {
    '/*': ['./src/server/llm/prompts/**/*.md'],
  },
}

export default config
