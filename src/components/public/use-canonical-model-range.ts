'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { canonicalModelRangeSearch } from '~/lib/model-filters'
import { api } from '~/trpc/react'

export function useCanonicalModelRange() {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const legacy = params.get('modelSnapshotId')
  const query = api.benchmarkRanking.resolveModelRange.useQuery(
    { modelSnapshotId: legacy ?? '', modelRangeId: params.get('modelRangeId') ?? undefined },
    { enabled: legacy !== null, retry: false },
  )
  const resolved = query.data?.modelRangeId
  useEffect(() => {
    if (legacy !== null && resolved) {
      router.replace(
        `${pathname}?${canonicalModelRangeSearch(new URLSearchParams(params.toString()), resolved)}`,
        { scroll: false },
      )
    }
  }, [legacy, resolved, params, pathname, router])
}
