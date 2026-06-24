'use client'

import { Analytics as VercelAnalytics } from '@vercel/analytics/next'
import { filterAnalyticsEvent } from '~/lib/analytics'

export function Analytics() {
  return <VercelAnalytics beforeSend={filterAnalyticsEvent} />
}
