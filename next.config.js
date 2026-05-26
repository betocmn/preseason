import './src/env.js'

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    imageSizes: [16, 32, 48, 64, 96, 128],
  },
  outputFileTracingIncludes: {
    '/*': ['./src/server/llm/prompts/**/*.md'],
  },
}

export default config
