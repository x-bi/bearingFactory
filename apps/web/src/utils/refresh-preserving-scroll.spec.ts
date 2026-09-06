import { afterEach, describe, expect, it, vi } from 'vitest'
import { refreshPreservingScroll } from './refresh-preserving-scroll'

describe('refreshPreservingScroll', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('restores the window scroll position after data refresh', async () => {
    const scrollTo = vi.fn()
    vi.stubGlobal('window', { scrollY: 640, scrollTo })
    const refresh = vi.fn().mockResolvedValue(undefined)

    await refreshPreservingScroll(refresh)

    expect(refresh).toHaveBeenCalledOnce()
    expect(scrollTo).toHaveBeenCalledWith({ top: 640, behavior: 'auto' })
  })
})
