import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadFreshBenchmarkAdminPage } from './navigation'

describe('loadFreshBenchmarkAdminPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reloads the current document when no path is provided', () => {
    const location = {
      assign: vi.fn(),
      reload: vi.fn(),
    }

    vi.stubGlobal('window', { location })

    loadFreshBenchmarkAdminPage()

    expect(location.reload).toHaveBeenCalledTimes(1)
    expect(location.assign).not.toHaveBeenCalled()
  })

  it('navigates with a full document load when a path is provided', () => {
    const location = {
      assign: vi.fn(),
      reload: vi.fn(),
    }

    vi.stubGlobal('window', { location })

    loadFreshBenchmarkAdminPage('/admin/benchmark')

    expect(location.assign).toHaveBeenCalledWith('/admin/benchmark')
    expect(location.reload).not.toHaveBeenCalled()
  })
})
