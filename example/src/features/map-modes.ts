import type { AppContext, Feature } from '../lib/feature'

/** Default / grayscale map-mode registration and toggle buttons. */
export function createMapModes(ctx: AppContext): Feature {
  const defaultBtn = document.getElementById('btn-mapmode-default')!
  const grayscaleBtn = document.getElementById('btn-mapmode-grayscale')!
  const ac = new AbortController()

  return {
    mount() {
      const keys = ctx.sectorKeys
      const defaultColors = new Uint32Array(keys.length)
      const grayscaleColors = new Uint32Array(keys.length)
      for (let i = 0; i < keys.length; i++) {
        const packed = parseInt(keys[i], 16)
        defaultColors[i] = packed
        const r = (packed >>> 16) & 0xff
        const g = (packed >>> 8) & 0xff
        const b = packed & 0xff
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
        grayscaleColors[i] = (gray << 16) | (gray << 8) | gray
      }
      ctx.engine.registerMapMode('default', defaultColors)
      ctx.engine.registerMapMode('grayscale', grayscaleColors)
      ctx.engine.setMapMode('default')

      defaultBtn.addEventListener(
        'click',
        () => ctx.engine.setMapMode('default'),
        { signal: ac.signal }
      )
      grayscaleBtn.addEventListener(
        'click',
        () => ctx.engine.setMapMode('grayscale'),
        { signal: ac.signal }
      )
    },
    destroy() {
      ac.abort()
    },
  }
}
