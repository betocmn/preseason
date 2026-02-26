import createNextIntlPlugin from 'next-intl/plugin'
import './src/env.js'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,
}

export default withNextIntl(config)
