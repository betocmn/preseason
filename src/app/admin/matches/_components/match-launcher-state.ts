export type MatchLaunchRow = {
  id: string
  categoryId: string
  toolAId: string
  toolBId: string
}

type ClientCryptoLike = {
  randomUUID?: () => string
  getRandomValues?: (array: Uint8Array) => Uint8Array
}

export type MatchLaunchRowErrors = Partial<{
  categoryId: string
  toolAId: string
  toolBId: string
  duplicate: string
}>

function getClientCrypto(): ClientCryptoLike | undefined {
  if (typeof globalThis.crypto !== 'object' || globalThis.crypto === null) {
    return undefined
  }

  return {
    randomUUID:
      typeof globalThis.crypto.randomUUID === 'function'
        ? globalThis.crypto.randomUUID.bind(globalThis.crypto)
        : undefined,
    getRandomValues:
      typeof globalThis.crypto.getRandomValues === 'function'
        ? globalThis.crypto.getRandomValues.bind(globalThis.crypto)
        : undefined,
  }
}

function formatUuidFromBytes(bytes: Uint8Array) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))

  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

function getRandomUuidBytes(cryptoLike?: ClientCryptoLike | null) {
  const bytes = new Uint8Array(16)

  if (cryptoLike?.getRandomValues) {
    cryptoLike.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }

  const versionByte = bytes[6] ?? 0
  const variantByte = bytes[8] ?? 0

  bytes[6] = (versionByte & 0x0f) | 0x40
  bytes[8] = (variantByte & 0x3f) | 0x80

  return bytes
}

export function createClientUuid(
  cryptoLike: ClientCryptoLike | null | undefined = getClientCrypto(),
) {
  if (cryptoLike?.randomUUID) {
    return cryptoLike.randomUUID()
  }

  return formatUuidFromBytes(getRandomUuidBytes(cryptoLike))
}

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
