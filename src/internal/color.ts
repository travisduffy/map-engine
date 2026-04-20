/** @main-thread-only — uses OffscreenCanvas; do not import from SectorRegistry or SectorBitmapParser */
const _canvas = new OffscreenCanvas(1, 1)
const _ctx = _canvas.getContext('2d')!

export function parseColorToRgb(color: string): {
  r: number
  g: number
  b: number
} {
  _ctx.clearRect(0, 0, 1, 1)
  _ctx.fillStyle = color
  _ctx.fillRect(0, 0, 1, 1)
  const d = _ctx.getImageData(0, 0, 1, 1).data
  return { r: d[0], g: d[1], b: d[2] }
}
