import { getCatalogLlmByModelId } from './catalog'

export type RangeSnapshot = {
  requestedModelId: string
  provider: string
  company: string
  modelFamily: string
  modelVersion: string
}

/** Catalog membership is independent of immutable snapshot family/drift metadata. */
export function getModelRange(snapshot: RangeSnapshot) {
  const entry = getCatalogLlmByModelId(snapshot.requestedModelId)
  if (entry) return { ...entry.range, company: entry.company }

  // Preserve custom and legacy families without exposing individual snapshot IDs.
  return {
    id: `${encodeURIComponent(snapshot.provider)}:${encodeURIComponent(snapshot.modelFamily)}`,
    name: snapshot.modelFamily,
    company: snapshot.company,
    version: snapshot.modelVersion,
    order: 0,
  }
}

export function summarizeModelRanges(snapshots: RangeSnapshot[]) {
  const ranges = new Map<string, ReturnType<typeof getModelRange>[]>()
  for (const snapshot of snapshots) {
    const range = getModelRange(snapshot)
    const versions = ranges.get(range.id) ?? []
    if (!versions.some((version) => version.version === range.version)) versions.push(range)
    ranges.set(range.id, versions)
  }
  return [...ranges.values()]
    .map((versions) => {
      versions.sort(
        (a, b) => a.order - b.order || a.version.localeCompare(b.version, 'en', { numeric: true }),
      )
      const first = versions[0]
      const last = versions[versions.length - 1]
      if (!first || !last) throw new Error('Cannot summarize an empty model range')
      return {
        id: first.id,
        name: first.name,
        company: first.company,
        label:
          versions.length === 1 ? first.name : `${first.name} ${first.version}–${last.version}`,
      }
    })
    .sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name))
}
