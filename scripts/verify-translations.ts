import fs from 'node:fs'
import path from 'node:path'

const messagesDir = path.resolve(import.meta.dirname, '..', 'messages')

function loadJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

const files = fs.readdirSync(messagesDir).filter((f) => f.endsWith('.json'))

if (files.length < 2) {
  console.log('Need at least 2 locale files to compare.')
  process.exit(1)
}

const locales = new Map<string, string[]>()
for (const file of files) {
  const locale = path.basename(file, '.json')
  const data = loadJson(path.join(messagesDir, file))
  locales.set(locale, flattenKeys(data))
}

const reference = 'en'
const refKeys = new Set(locales.get(reference) ?? [])
let hasErrors = false

for (const [locale, keys] of locales) {
  if (locale === reference) continue

  const localeKeys = new Set(keys)
  const missing = [...refKeys].filter((k) => !localeKeys.has(k))
  const extra = [...localeKeys].filter((k) => !refKeys.has(k))

  if (missing.length === 0 && extra.length === 0) {
    console.log(`✓ ${locale}: All ${refKeys.size} keys match ${reference}`)
  } else {
    hasErrors = true
    if (missing.length > 0) {
      console.log(`✗ ${locale}: Missing ${missing.length} keys from ${reference}:`)
      for (const key of missing) {
        console.log(`    - ${key}`)
      }
    }
    if (extra.length > 0) {
      console.log(`✗ ${locale}: ${extra.length} extra keys not in ${reference}:`)
      for (const key of extra) {
        console.log(`    + ${key}`)
      }
    }
  }
}

if (hasErrors) {
  process.exit(1)
}
