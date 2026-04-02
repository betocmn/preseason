export type MatchLaunchRow = {
  id: string
  categoryId: string
  toolAId: string
  toolBId: string
}

export type MatchLaunchRowErrors = Partial<{
  categoryId: string
  toolAId: string
  toolBId: string
  duplicate: string
}>

export function canonicalizeMatchLaunchKey(categoryId: string, toolAId: string, toolBId: string) {
  const normalizedToolAId = toolAId.toLowerCase()
  const normalizedToolBId = toolBId.toLowerCase()
  const [firstToolId, secondToolId] =
    normalizedToolAId < normalizedToolBId
      ? [normalizedToolAId, normalizedToolBId]
      : [normalizedToolBId, normalizedToolAId]

  return `${categoryId}:${firstToolId}:${secondToolId}`
}

export function validateMatchLaunchRows(rows: MatchLaunchRow[]) {
  const rowErrors = new Map<string, MatchLaunchRowErrors>()
  const duplicateRowIdsByKey = new Map<string, string[]>()

  for (const row of rows) {
    const errors: MatchLaunchRowErrors = {}

    if (!row.categoryId) {
      errors.categoryId = 'Select a category'
    }
    if (!row.toolAId) {
      errors.toolAId = 'Select Tool A'
    }
    if (!row.toolBId) {
      errors.toolBId = 'Select Tool B'
    }

    if (row.toolAId && row.toolBId && row.toolAId.toLowerCase() === row.toolBId.toLowerCase()) {
      errors.toolBId = 'Choose two different tools'
    }

    if (row.categoryId && row.toolAId && row.toolBId) {
      const key = canonicalizeMatchLaunchKey(row.categoryId, row.toolAId, row.toolBId)
      const existingIds = duplicateRowIdsByKey.get(key) ?? []
      duplicateRowIdsByKey.set(key, [...existingIds, row.id])
    }

    rowErrors.set(row.id, errors)
  }

  for (const duplicateRowIds of duplicateRowIdsByKey.values()) {
    if (duplicateRowIds.length < 2) continue

    for (const rowId of duplicateRowIds) {
      const currentErrors = rowErrors.get(rowId) ?? {}
      rowErrors.set(rowId, {
        ...currentErrors,
        duplicate: 'This matchup is duplicated in the queue',
      })
    }
  }

  const hasErrors = [...rowErrors.values()].some((errors) => Object.keys(errors).length > 0)

  return {
    rowErrors,
    canSubmit: rows.length > 0 && !hasErrors,
  }
}

export function stripMatchLaunchRows(rows: MatchLaunchRow[]) {
  return rows.map(({ categoryId, toolAId, toolBId }) => ({
    categoryId,
    toolAId,
    toolBId,
  }))
}
