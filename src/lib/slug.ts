export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
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
