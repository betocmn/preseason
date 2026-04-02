'use client'

// Admin pages live behind rewrites, so client-side route reuse can show stale
// RSC payloads after mutations. Force a document navigation so the next render
// always comes from the server.
export function loadFreshAdminPage(path?: string) {
  if (typeof window === 'undefined') {
    return
  }

  if (path) {
    window.location.assign(path)
    return
  }

  window.location.reload()
}
