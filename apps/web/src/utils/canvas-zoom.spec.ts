import { describe, expect, it } from 'vitest'
import {
  centeredScrollOffset,
  clampZoom,
  exceedsDragThreshold,
  parseStoredCanvasPosition,
  parseStoredZoom,
} from './canvas-zoom'

describe('canvas zoom', () => {
  it('keeps the currently viewed logical point centered while zooming', () => {
    const nextOffset = centeredScrollOffset(180, 360, 0.6, 0.9)

    expect(nextOffset).toBe(360)
    expect((nextOffset + 180) / 0.9).toBe((180 + 180) / 0.6)
  })

  it('clamps zoom to the supported range', () => {
    expect(clampZoom(0.1, 0.3, 2)).toBe(0.3)
    expect(clampZoom(2.4, 0.3, 2)).toBe(2)
    expect(clampZoom(0.876, 0.3, 2)).toBe(0.88)
  })

  it('restores a valid cached zoom and ignores corrupted values', () => {
    expect(parseStoredZoom('0.8', 0.3, 2)).toBe(0.8)
    expect(parseStoredZoom('2.8', 0.3, 2)).toBe(2)
    expect(parseStoredZoom('invalid', 0.3, 2)).toBeNull()
    expect(parseStoredZoom(null, 0.3, 2)).toBeNull()
  })

  it('restores valid canvas scroll offsets and rejects corrupted positions', () => {
    expect(parseStoredCanvasPosition('{"left":320,"top":180}')).toEqual({
      left: 320,
      top: 180,
    })
    expect(parseStoredCanvasPosition('{"left":-1,"top":20}')).toBeNull()
    expect(parseStoredCanvasPosition('{"left":20}')).toBeNull()
    expect(parseStoredCanvasPosition('invalid')).toBeNull()
  })

  it('starts dragging only after pointer movement passes the threshold', () => {
    expect(exceedsDragThreshold(100, 80, 103, 82)).toBe(false)
    expect(exceedsDragThreshold(100, 80, 104, 82)).toBe(true)
  })
})
