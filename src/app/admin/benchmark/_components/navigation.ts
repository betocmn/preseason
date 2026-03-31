'use client'

// Benchmark admin pages live behind a rewrite, so client-side route reuse can
// show stale RSC payloads after mutations. Force a document navigation so the
// next render always comes from the server.
export function loadFreshBenchmarkAdminPage(path?: string) {
  if (typeof window === 'undefined') {
    return
  }

  if (path) {
    window.location.assign(path)
    return
  }

  window.location.reload()
}
