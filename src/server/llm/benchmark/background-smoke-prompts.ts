import { serverSettings } from '~/constants/server-settings'

type BackgroundSmokePromptSelection = {
  slug: string
  level: string
}

function backgroundSmokePromptKey(selection: BackgroundSmokePromptSelection) {
  return `${selection.slug}:${selection.level}`
}

export const backgroundSmokePromptSlugs = [
  ...new Set(serverSettings.backgroundSmoke.promptSelections.map(({ slug }) => slug)),
]

export function selectBackgroundSmokePromptRows<T extends BackgroundSmokePromptSelection>(
  rows: readonly T[],
  selections: readonly BackgroundSmokePromptSelection[] = serverSettings.backgroundSmoke
    .promptSelections,
) {
  const selectionKeys = new Set(selections.map(backgroundSmokePromptKey))
  const rowsByKey = new Map<string, T>()

  for (const row of rows) {
    const key = backgroundSmokePromptKey(row)
    if (!selectionKeys.has(key)) {
      continue
    }

    if (rowsByKey.has(key)) {
      throw new Error(
        `Expected one background smoke prompt fixture for ${row.slug} (${row.level}), found multiple`,
      )
    }

    rowsByKey.set(key, row)
  }

  return selections.map((selection) => {
    const row = rowsByKey.get(backgroundSmokePromptKey(selection))
    if (!row) {
      throw new Error(
        `Expected background smoke prompt fixture ${selection.slug} (${selection.level}), found none`,
      )
    }

    return row
  })
}
