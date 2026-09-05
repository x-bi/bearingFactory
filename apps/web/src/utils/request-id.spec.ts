import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequestId } from './request-id'

describe('createRequestId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses randomUUID when the browser provides it', () => {
    vi.stubGlobal('crypto', {
      randomUUID: () => 'native-request-id',
    })

    expect(createRequestId()).toBe('native-request-id')
  })

  it('creates a UUID when randomUUID is unavailable on an HTTP IP origin', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0)
        return bytes
      },
    })

    expect(createRequestId()).toBe('00000000-0000-4000-8000-000000000000')
  })
})
