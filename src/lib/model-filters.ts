export type ModelFilterModel = {
  id: string
  version: string
  name: string
}

export type ModelFilterFamily = {
  name: string
  models: ModelFilterModel[]
}

export type ModelFilterCompany = {
  name: string
  families: ModelFilterFamily[]
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizeModelSnapshotId(
  companies: ModelFilterCompany[],
  modelSnapshotId?: string,
) {
  if (!modelSnapshotId || !UUID_REGEX.test(modelSnapshotId)) return undefined

  const allModelIds = new Set(
    companies.flatMap((company) =>
      company.families.flatMap((family) => family.models.map((model) => model.id)),
    ),
  )

  return allModelIds.has(modelSnapshotId) ? modelSnapshotId : undefined
}
