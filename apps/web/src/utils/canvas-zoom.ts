export function clampZoom(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number(value.toFixed(2))))
}

export function parseStoredZoom(
  value: string | null,
  minimum: number,
  maximum: number,
) {
  if (value === null || value.trim() === '') return null
  const zoom = Number(value)
  return Number.isFinite(zoom) ? clampZoom(zoom, minimum, maximum) : null
}

export function parseStoredCanvasPosition(value: string | null) {
  if (value === null || value.trim() === '') return null
  try {
    const position = JSON.parse(value) as { left?: unknown; top?: unknown }
    if (
      typeof position.left !== 'number' ||
      !Number.isFinite(position.left) ||
      position.left < 0 ||
      typeof position.top !== 'number' ||
      !Number.isFinite(position.top) ||
      position.top < 0
    ) {
      return null
    }
    return { left: position.left, top: position.top }
  } catch {
    return null
  }
}

export function centeredScrollOffset(
  scrollOffset: number,
  viewportSize: number,
  previousZoom: number,
  nextZoom: number,
) {
  const logicalCenter = (scrollOffset + viewportSize / 2) / previousZoom
  return Math.max(0, logicalCenter * nextZoom - viewportSize / 2)
}

export function exceedsDragThreshold(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  threshold = 5,
) {
  return (
    Math.abs(currentX - startX) + Math.abs(currentY - startY) > threshold
  )
}
