/** @main-thread-only — uses OffscreenCanvas; do not import from SectorRegistry or SectorBitmapParser */
const _canvas = new OffscreenCanvas(1, 1)
const _ctx = _canvas.getContext('2d')!

/**
 * Parses any CSS color string to `{ r, g, b }` by painting a 1×1 scratch
 * canvas and reading the pixel back — the browser's own parser handles
 * every CSS color form. The fill style is reset to `#000000` first, so an
 * invalid color falls back to black rather than a stale previous value.
 * Main-thread only (`OffscreenCanvas` 2D context).
 */
export function parseColorToRgb(color: string): {
  r: number
  g: number
  b: number
} {
  _ctx.clearRect(0, 0, 1, 1)
  _ctx.fillStyle = '#000000' // reset so invalid colors fall back to black, not a stale value
  _ctx.fillStyle = color
  _ctx.fillRect(0, 0, 1, 1)
  const d = _ctx.getImageData(0, 0, 1, 1).data
  return { r: d[0], g: d[1], b: d[2] }
}
