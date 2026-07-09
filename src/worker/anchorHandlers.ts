import type { WorkerMessage } from '../types'
import { registerCallHandler } from './callHandlers'
import { getWorkerState } from './state'
import { yieldIfNeeded } from './yield'
import { polylabel } from './polylabel'

const VOID_ID = 0xffff

/**
 * Worker-side ring bookkeeping (mirrors `aggregationHandlers.ts`'s F-C.8
 * free list): a free list of reclaimed anchor buffers, reused ahead of
 * allocating new ones.
 */
let freeBuffers: Int16Array[] = []
/** -1 is not a valid length, so the first `computeAnchors` call always (re)allocates. */
let anchorLen = -1

/**
 * FIFO serialization -- a separate chain from `aggregationHandlers`'s, since
 * anchors share no mutable module state with groups. `computeAnchors` has no
 * other Worker CALL competing for this module's state, but the chain keeps
 * the pattern consistent with CA-4/CA-5 and protects against overlapping
 * `computeAnchors` calls racing the same free list.
 */
let chain: Promise<unknown> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn)
  chain = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

/** Reclaims a bounced-back buffer. Called from the Worker entry's `returnAnchors` case. */
export function handleReturnAnchors(buffer: Int16Array): void {
  freeBuffers.push(buffer)
}

/**
 * Synthesizes the map-edge contour cracks the B1.e scan never emits (it
 * checks `x < width-1` / `y < height-1`, so the bitmap's outer edge has no
 * segments -- see `SectorRegistry.ts:149,169`). Bucketed once per sector id
 * over a single O(2*(width+height)) pass, not re-scanned per sector.
 */
function synthesizeEdgeCracks(
  pixelIndices: Uint32Array,
  width: number,
  height: number
): Map<number, number[]> {
  const buckets = new Map<number, number[]>()
  const push = (
    id: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): void => {
    if (id === VOID_ID) return
    let arr = buckets.get(id)
    if (!arr) {
      arr = []
      buckets.set(id, arr)
    }
    arr.push(x1, y1, x2, y2)
  }

  for (let x = 0; x < width; x++) {
    push(pixelIndices[x], x, 0, x + 1, 0) // top row
    push(pixelIndices[(height - 1) * width + x], x, height, x + 1, height) // bottom row
  }
  for (let y = 0; y < height; y++) {
    push(pixelIndices[y * width], 0, y, 0, y + 1) // left column
    push(pixelIndices[y * width + (width - 1)], width, y, width, y + 1) // right column
  }

  return buckets
}

/** Concatenates sector `id`'s interior contour slice with its synthesized edge cracks (if any). */
function buildSectorSegments(
  contourPointers: Uint32Array,
  contourPoints: Int16Array,
  cracks: Map<number, number[]>,
  id: number
): { segments: Float64Array; segCount: number } {
  const startSeg = contourPointers[id]
  const endSeg = contourPointers[id + 1]
  const contourSegCount = endSeg - startSeg
  const crackArr = cracks.get(id)
  const crackSegCount = crackArr ? crackArr.length / 4 : 0
  const totalSegCount = contourSegCount + crackSegCount

  const segments = new Float64Array(totalSegCount * 4)
  segments.set(contourPoints.subarray(startSeg * 4, endSeg * 4), 0)
  if (crackArr) segments.set(crackArr, contourSegCount * 4)

  return { segments, segCount: totalSegCount }
}

registerCallHandler('computeAnchors', (): Promise<void> => {
  return enqueue(async () => {
    const state = getWorkerState()
    if (!state) throw new Error('computeAnchors: Worker not bootstrapped')

    const {
      sectorCount,
      pixelIndices,
      width,
      height,
      contourPointers,
      contourPoints,
      bboxes,
      centroids,
    } = state

    const newAnchorLen = sectorCount * 2
    if (newAnchorLen !== anchorLen) {
      freeBuffers = []
      anchorLen = newAnchorLen
      self.postMessage({
        type: 'INIT_ANCHORS',
        sectorCount,
      } satisfies WorkerMessage)
    }

    const buffer = freeBuffers.pop() ?? new Int16Array(anchorLen)
    const cracks = synthesizeEdgeCracks(pixelIndices, width, height)
    const yieldState = { lastYield: performance.now() }

    for (let id = 0; id < sectorCount; id++) {
      const { segments, segCount } = buildSectorSegments(
        contourPointers,
        contourPoints,
        cracks,
        id
      )
      // Expand the pixel bbox by 1 -- contour/crack segments live on the
      // pixel-corner lattice, extending up to (maxX+1, maxY+1).
      const minX = bboxes[id * 4]
      const minY = bboxes[id * 4 + 1]
      const maxX = bboxes[id * 4 + 2] + 1
      const maxY = bboxes[id * 4 + 3] + 1
      const extraCandidates: Array<[number, number]> = [
        [centroids[id * 2], centroids[id * 2 + 1]],
      ]

      const pole = await polylabel(
        segments,
        segCount,
        minX,
        minY,
        maxX,
        maxY,
        1.0,
        extraCandidates,
        yieldState
      )

      // Math.floor, not Math.round: contour cracks live on the pixel-corner
      // lattice, so a single-pixel sector's pole at (px+0.5, py+0.5) would
      // round to a different (unowned) pixel; floor of a strictly-interior
      // point always lands in a pixel the sector actually owns.
      buffer[id * 2] = Math.floor(pole.x)
      buffer[id * 2 + 1] = Math.floor(pole.y)

      await yieldIfNeeded(yieldState)
    }

    // Cast rationale: see aggregationHandlers.ts -- this project's `lib`
    // config has no `webworker` entry, so `self.postMessage`'s typed
    // overload set resolves to `Window`'s, whose 3-arg form wants a string
    // `targetOrigin`, not a Transferable[].
    ;(self.postMessage as (message: unknown, transfer: Transferable[]) => void)(
      { type: 'anchors', buffer } satisfies WorkerMessage,
      [buffer.buffer]
    )
  })
})
