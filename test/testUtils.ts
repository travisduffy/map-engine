import { vi } from 'vitest'
import type { MapRenderer } from '../src/MapRenderer'

// Import-isolation verification commands (AC 1.10):
//   grep -rn 'internal/color' src/SectorRegistry.ts src/SectorBitmapParser.ts   # must return empty
//   grep -rn 'SectorRegistry\|SectorBitmapParser' src/internal/color.ts          # must return empty

export function makeCanvas(width = 800, height = 600): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  canvas.width = width
  canvas.height = height
  Object.defineProperty(canvas, 'clientWidth', {
    value: width,
    configurable: true,
  })
  Object.defineProperty(canvas, 'clientHeight', {
    value: height,
    configurable: true,
  })
  document.body.appendChild(canvas)
  return canvas
}

export function advanceFrame(renderer: MapRenderer, dtMillis: number): void {
  vi.advanceTimersByTime(dtMillis)
  renderer['_preRenderHook']?.()
}

export function buildTestBuffer(
  width: number,
  height: number,
  pixels: Array<[number, number, number]>
): Uint8ClampedArray {
  if (pixels.length !== width * height) {
    throw new Error(
      `buildTestBuffer: pixels.length (${pixels.length}) !== width * height (${width * height})`
    )
  }
  const buf = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < pixels.length; i++) {
    const [r, g, b] = pixels[i]
    buf[i * 4] = r
    buf[i * 4 + 1] = g
    buf[i * 4 + 2] = b
    buf[i * 4 + 3] = 255
  }
  return buf
}
