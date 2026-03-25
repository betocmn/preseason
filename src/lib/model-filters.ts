export type ModelFilterModel = {
  id: string
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

type ModelSelectionInput = {
  modelCompany?: string
  modelFamily?: string
  modelSnapshotId?: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizeModelSelection(
  companies: ModelFilterCompany[],
  input: ModelSelectionInput,
): ModelSelectionInput {
  const companyLookup = new Map(companies.map((company) => [company.name, company]))

  const modelLookup = new Map(
    companies.flatMap((company) =>
      company.families.flatMap((family) =>
        family.models.map((model) => [
          model.id,
          {
            company: company.name,
            family: family.name,
          },
        ]),
      ),
    ),
  )

  const modelSnapshotId =
    input.modelSnapshotId && UUID_REGEX.test(input.modelSnapshotId)
      ? input.modelSnapshotId
      : undefined
  const selectedModel = modelSnapshotId ? modelLookup.get(modelSnapshotId) : undefined

  const modelCompany =
    selectedModel?.company ??
    (input.modelCompany && companyLookup.has(input.modelCompany) ? input.modelCompany : undefined)

  const availableFamilies = modelCompany
    ? (companyLookup.get(modelCompany)?.families.map((family) => family.name) ?? [])
    : Array.from(
        new Set(companies.flatMap((company) => company.families.map((family) => family.name))),
      )

  const modelFamily =
    selectedModel?.family ??
    (input.modelFamily && availableFamilies.includes(input.modelFamily)
      ? input.modelFamily
      : undefined)

  return {
    modelCompany,
    modelFamily,
    modelSnapshotId: selectedModel ? modelSnapshotId : undefined,
  }
}
