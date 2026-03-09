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
  const month = periodStart.slice(0, 7)
  return `${toolASlug}-vs-${toolBSlug}-${categorySlug}-${month}`
}

export function deduplicateSlug(baseSlug: string, existingSlugs: Set<string>): string {
  let slug = baseSlug
  let counter = 2
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}-${counter}`
    counter++
  }
  return slug
}
