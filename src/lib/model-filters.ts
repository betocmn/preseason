export type ModelFilterCompany = {
  name: string
  ranges: { id: string; name: string; label: string }[]
}

/** Keep model selections intact so invalid or conflicting links produce an error, not unfiltered data. */
export function rankingFiltersFromSearchParams(searchParams: URLSearchParams) {
  const promptLevel = searchParams.get('promptLevel')
  const modelTier = searchParams.get('modelTier')
  const dateRange = searchParams.get('dateRange')
  return {
    promptLevel: (['beginner', 'intermediate', 'advanced'] as const).find(
      (value) => value === promptLevel,
    ),
    modelTier: (['frontier', 'mid', 'small'] as const).find((value) => value === modelTier),
    dateRange: (['1m', '3m', '6m'] as const).find((value) => value === dateRange),
    modelRangeId: searchParams.get('modelRangeId') ?? undefined,
    modelRangeIds: searchParams.has('modelRangeIds')
      ? searchParams.getAll('modelRangeIds')
      : undefined,
    modelSnapshotId: searchParams.get('modelSnapshotId') ?? undefined,
  }
}

export function canonicalModelRangeSearch(searchParams: URLSearchParams, modelRangeId: string) {
  const params = new URLSearchParams(searchParams)
  params.delete('modelSnapshotId')
  params.set('modelRangeId', modelRangeId)
  return params.toString()
}
