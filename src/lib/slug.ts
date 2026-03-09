function normalizeSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function slugify(text: string, fallback?: string): string {
  const slug = normalizeSlug(text)
  if (slug.length > 0) {
    return slug
  }
  if (fallback === undefined) {
    return ''
  }

  return normalizeSlug(fallback) || fallback.toLowerCase()
}

export function buildMatchSlug(
  toolASlug: string,
  toolBSlug: string,
  categorySlug: string,
  periodStart: string,
): string {
  const date = periodStart.slice(0, 10)
  const raw = `${toolASlug}-vs-${toolBSlug}-${categorySlug}-${date}`
  return raw.length > 255 ? raw.slice(0, 255).replace(/-+$/, '') : raw
}

export function deduplicateSlug(
  baseSlug: string,
  existingSlugs: Set<string>,
  maxLength = 255,
): string {
  let slug = baseSlug.slice(0, maxLength)
  let counter = 2
  while (existingSlugs.has(slug)) {
    const suffix = `-${counter}`
    slug = `${baseSlug.slice(0, maxLength - suffix.length)}${suffix}`
    counter++
  }
  return slug
}
