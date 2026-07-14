/**
 * Decodes a sector bitmap (PNG URL or Blob) into a raw RGBA pixel buffer
 * plus dimensions, via `createImageBitmap` + an `OffscreenCanvas` 2D
 * readback. Worker-compatible: zero DOM access (`OffscreenCanvas`, never a
 * DOM canvas element).
 */
export class SectorBitmapParser {
  /**
   * Fetches `source` when it is a URL string (throwing on a non-OK
   * response) or uses the Blob directly, decodes it with
   * `createImageBitmap` (called without options — safe because the bitmap
   * guarantees alpha=255), and reads the pixels back through an
   * `OffscreenCanvas` 2D context.
   */
  async parse(
    source: string | Blob
  ): Promise<{ buffer: Uint8ClampedArray; width: number; height: number }> {
    if (typeof source !== 'string' && !(source instanceof Blob)) {
      throw new Error(
        'SectorBitmapParser.parse: source must be a string URL or Blob'
      )
    }

    let blob: Blob
    if (typeof source === 'string') {
      const response = await fetch(source)
      if (!response.ok) {
        throw new Error(
          `SectorBitmapParser: failed to load bitmap — HTTP ${response.status} ${response.statusText}`
        )
      }
      blob = await response.blob()
    } else {
      blob = source
    }

    const bitmap = await createImageBitmap(blob)
    const { width, height } = bitmap

    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const imageData = ctx.getImageData(0, 0, width, height)

    return { buffer: imageData.data, width, height }
  }
}
