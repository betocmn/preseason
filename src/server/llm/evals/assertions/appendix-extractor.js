// @ts-nocheck
const OPEN_TAG = '<preseason_benchmark_json>'
const CLOSE_TAG = '</preseason_benchmark_json>'

function findFirstNonWhitespaceIndex(rawContent, start) {
  let index = start
  while (index < rawContent.length && /\s/u.test(rawContent[index] ?? '')) {
    index += 1
  }

  return index < rawContent.length ? index : -1
}

function findJsonTerminatedCloseTag(rawContent, contentStart) {
  const jsonStart = findFirstNonWhitespaceIndex(rawContent, contentStart)
  if (jsonStart === -1) {
    return null
  }

  if (rawContent[jsonStart] !== '{' && rawContent[jsonStart] !== '[') {
    return null
  }

  let depth = 0
  let inString = false
  let isEscaped = false

  for (let idx = jsonStart; idx < rawContent.length; idx += 1) {
    const char = rawContent[idx]
    if (char === undefined) {
      break
    }

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (inString) {
      if (char === '\\') {
        isEscaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{' || char === '[') {
      depth += 1
      continue
    }

    if (char === '}' || char === ']') {
      depth -= 1
      if (depth !== 0) {
        continue
      }

      let closeIdx = idx + 1
      while (closeIdx < rawContent.length && /\s/u.test(rawContent[closeIdx] ?? '')) {
        closeIdx += 1
      }

      return rawContent.startsWith(CLOSE_TAG, closeIdx) ? closeIdx : null
    }
  }

  return null
}

function findAppendixTagBlock(rawContent) {
  let searchFrom = rawContent.length

  while (searchFrom >= 0) {
    const openIdx = rawContent.lastIndexOf(OPEN_TAG, searchFrom)
    if (openIdx === -1) {
      return null
    }

    const contentStart = findFirstNonWhitespaceIndex(rawContent, openIdx + OPEN_TAG.length)
    if (
      contentStart === -1 ||
      (rawContent[contentStart] !== '{' && rawContent[contentStart] !== '[')
    ) {
      searchFrom = openIdx - 1
      continue
    }

    const closeIdx =
      findJsonTerminatedCloseTag(rawContent, openIdx + OPEN_TAG.length) ??
      rawContent.indexOf(CLOSE_TAG, openIdx + OPEN_TAG.length)

    if (closeIdx !== -1) {
      return { openIdx, closeIdx }
    }

    searchFrom = openIdx - 1
  }

  return null
}

function extractAppendixJson(output) {
  const tagBlock = findAppendixTagBlock(output)
  if (!tagBlock) {
    throw new Error('Missing preseason benchmark appendix tags')
  }

  return output.slice(tagBlock.openIdx + OPEN_TAG.length, tagBlock.closeIdx).trim()
}

function parseAppendix(output) {
  return JSON.parse(extractAppendixJson(output))
}

module.exports = {
  CLOSE_TAG,
  OPEN_TAG,
  extractAppendixJson,
  parseAppendix,
}
