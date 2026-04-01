// @ts-nocheck
const OPEN_TAG = '<preseason_benchmark_json>'
const CLOSE_TAG = '</preseason_benchmark_json>'

function fail(reason) {
  return {
    pass: false,
    score: 0,
    reason,
  }
}

module.exports = (output, { vars }) => {
  if (typeof output !== 'string' || output.trim().length === 0) {
    return fail('Model output is empty')
  }

  const openIndex = output.lastIndexOf(OPEN_TAG)
  const closeIndex = output.indexOf(CLOSE_TAG, openIndex + OPEN_TAG.length)
  if (openIndex === -1 || closeIndex === -1 || closeIndex <= openIndex) {
    return fail('Missing preseason benchmark appendix tags')
  }

  const rawJson = output.slice(openIndex + OPEN_TAG.length, closeIndex).trim()
  let parsed
  try {
    parsed = JSON.parse(rawJson)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown parse error'
    return fail(`Appendix JSON is invalid: ${message}`)
  }

  if (parsed?.schema_version !== 'benchmark-v1') {
    return fail(`Unexpected schema version: ${String(parsed?.schema_version)}`)
  }

  if (!Array.isArray(parsed?.categories)) {
    return fail('Appendix categories must be an array')
  }

  const expectedCategories = (() => {
    if (Array.isArray(vars.expected_categories)) {
      return vars.expected_categories.filter((value) => typeof value === 'string')
    }

    if (typeof vars.expected_categories === 'string') {
      try {
        const parsed = JSON.parse(vars.expected_categories)
        return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string') : []
      } catch {
        return []
      }
    }

    return []
  })()
  const actualCategorySlugs = []
  const seenCategorySlugs = new Set()

  for (const entry of parsed.categories) {
    if (!entry || typeof entry !== 'object') {
      return fail('Every appendix category entry must be an object')
    }

    if (typeof entry.category_slug !== 'string' || entry.category_slug.length === 0) {
      return fail('Each category entry needs a non-empty category_slug')
    }

    if (seenCategorySlugs.has(entry.category_slug)) {
      return fail(`Duplicate category entry: ${entry.category_slug}`)
    }
    seenCategorySlugs.add(entry.category_slug)
    actualCategorySlugs.push(entry.category_slug)

    if (entry.decision !== 'tool' && entry.decision !== 'none') {
      return fail(`Invalid decision for ${entry.category_slug}: ${String(entry.decision)}`)
    }

    if (typeof entry.reasoning !== 'string' || entry.reasoning.trim().length === 0) {
      return fail(`Missing reasoning for ${entry.category_slug}`)
    }

    if (typeof entry.confidence !== 'number' || entry.confidence < 0 || entry.confidence > 1) {
      return fail(`Confidence must be between 0 and 1 for ${entry.category_slug}`)
    }

    if (entry.decision === 'tool') {
      if (typeof entry.tool !== 'string' || entry.tool.trim().length === 0) {
        return fail(`Missing tool name for ${entry.category_slug}`)
      }
    } else if (entry.tool != null) {
      return fail(`Tool field must be omitted for none decision in ${entry.category_slug}`)
    }
  }

  const expectedSet = new Set(expectedCategories)
  if (expectedCategories.length !== actualCategorySlugs.length) {
    return fail(
      `Expected ${expectedCategories.length} categories but received ${actualCategorySlugs.length}`,
    )
  }

  for (const categorySlug of actualCategorySlugs) {
    if (!expectedSet.has(categorySlug)) {
      return fail(`Unexpected category in appendix: ${categorySlug}`)
    }
  }

  return {
    pass: true,
    score: 1,
    reason: `Parsed ${actualCategorySlugs.length} valid appendix categories`,
  }
}
