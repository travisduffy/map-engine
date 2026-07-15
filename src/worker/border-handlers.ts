import { MappingRequiredError } from '../shared/errors'
import { getParentMapping } from './aggregation-handlers'
import { registerCallHandler } from './call-handlers'
import { getWorkerState } from './state'
import { yieldIfNeeded } from './yield'
import type { WorkerMessage } from '../shared/types'

/** Sentinel pixel value: the pixel belongs to no defined sector (void). */
const VOID_ID = 0xffff
/** Sentinel mapping entry: the sector belongs to no group. */
const VOID_GROUP = 0xffff

/** A reclaimed (edges, count) pair -- the border ring cycles this pair as a unit (unlike the single-buffer anchor/group pools). */
interface BorderBufferPair {
  edges: Float32Array
  count: Uint32Array
}

/**
 * Worker-side ring bookkeeping (mirrors `aggregationHandlers.ts`'s F-C.8 free
 * list), but holding `(edges, count)` pairs rather than single buffers.
 * Seeded lazily on the first `recomputeBorders` call with the bootstrap-
 * transferred `state.borderEdges`/`state.borderEdgeCount` pair (already sized
 * to the fixed max capacity `4 * totalGeometricPerimeterSegments` -- see
 * SectorRegistry.ts) rather than allocating a fresh pair and discarding the
 * bootstrap allocation.
 */
let freeBuffers: BorderBufferPair[] = []
// Set once the bootstrap-transferred (edges, count) pair has seeded the free list.
let isSeeded = false

/**
 * FIFO serialization, deliberately separate from `aggregationHandlers`'s
 * chain: `recomputeBorders` shares no mutable module state with
 * `setParentMapping`/`aggregateGroups`, and the Worker-side handler captures
 * `getParentMapping()`'s return by reference at the top of each run (see
 * below), so an overlapping `setParentMapping` call may freely proceed on
 * its own chain without blocking or corrupting an in-flight extraction.
 */
let chain: Promise<unknown> = Promise.resolve()

/**
 * Appends `fn` to the FIFO chain. One entry's rejection never breaks the
 * chain for later entries -- the rejection is still delivered to that
 * entry's own caller via the returned Promise.
 */
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn)
  chain = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

/** Reclaims a bounced-back buffer pair. Called from the Worker entry's `returnBorderEdges` case. */
export function handleReturnBorderEdges(
  edges: Float32Array,
  count: Uint32Array
): void {
  freeBuffers.push({ edges, count })
}

/** Pops a reclaimed (edges, count) pair off the free list, or allocates a fresh pair with `edgesLength` capacity. */
function takeBuffers(edgesLength: number): BorderBufferPair {
  return (
    freeBuffers.pop() ?? {
      edges: new Float32Array(edgesLength),
      count: new Uint32Array(1),
    }
  )
}

/**
 * Determines the sector on the far side of a contour segment. `contourPoints`
 * stores only `[x1,y1,x2,y2]` per segment -- unlike the transient `idA`/`idB`
 * pairing used internally while `SectorRegistry` builds the CSR structure,
 * that identity is discarded before construction finishes (see
 * SectorRegistry.ts:282-303) -- so the far side must be re-derived by
 * resampling `pixelIndices` at the pixel pair adjacent to the segment. A
 * vertical segment (`x1 === x2`) sits between columns `x1-1` and `x1` at row
 * `y1`; a horizontal segment sits between rows `y1-1` and `y1` at column
 * `x1`. Exactly one of the two sampled pixels equals `ownId` (the sector
 * whose contour bucket this segment came from); the other is the far side.
 */
function resolveFarSide(
  x1: number,
  y1: number,
  x2: number,
  ownId: number,
  width: number,
  pixelIndices: Uint32Array
): number {
  let idA: number, idB: number
  if (x1 === x2) {
    idA = pixelIndices[y1 * width + (x1 - 1)]
    idB = pixelIndices[y1 * width + x1]
  } else {
    idA = pixelIndices[(y1 - 1) * width + x1]
    idB = pixelIndices[y1 * width + x1]
  }
  return idA === ownId ? idB : idA
}

/**
 * `recomputeBorders` CALL handler (CA-6): walks every sector's contour
 * bucket, resolves each segment's far-side sector by resampling
 * `pixelIndices`, dedups shared edges by lower-sector-id, emits an edge iff
 * the two sides' groups differ (sentinel-as-void rule), and pushes the
 * (edges, count) pair to Main as a Transferable `borderEdges` handoff.
 * Rejects with `MappingRequiredError` before the first `setParentMapping`
 * resolves.
 */
registerCallHandler('recomputeBorders', (): Promise<void> => {
  return enqueue(async () => {
    const state = getWorkerState()
    if (!state) throw new Error('recomputeBorders: Worker not bootstrapped')

    // Captured once, at the top of this run, before any `await` -- this is
    // the "snapshot the mapping at computation start" the Main-side
    // coalescing contract relies on (see MapEngine.recomputeBorders). A
    // concurrent `setParentMapping` reassigns the module-local `mapping` in
    // aggregationHandlers.ts by reference, never mutates the array this
    // reference points to, so this snapshot stays internally consistent
    // across every `yieldIfNeeded` below, even if a newer mapping is set
    // mid-computation.
    const mapping = getParentMapping()
    if (!mapping) {
      throw new MappingRequiredError(
        'recomputeBorders: setParentMapping() must resolve before recomputeBorders() is called.'
      )
    }

    if (!isSeeded) {
      freeBuffers.push({
        edges: state.borderEdges,
        count: state.borderEdgeCount,
      })
      isSeeded = true
    }

    const { edges, count } = takeBuffers(state.borderEdges.length)
    const { pixelIndices, width, sectorCount, contourPointers, contourPoints } =
      state

    let n = 0
    const yieldState = { lastYield: performance.now() }

    for (let id = 0; id < sectorCount; id++) {
      const start = contourPointers[id]
      const end = contourPointers[id + 1]
      for (let k = start; k < end; k++) {
        const base = k * 4
        const x1 = contourPoints[base]
        const y1 = contourPoints[base + 1]
        const x2 = contourPoints[base + 2]
        const y2 = contourPoints[base + 3]

        const farId = resolveFarSide(x1, y1, x2, id, width, pixelIndices)

        // Dedup: a shared edge between two real sectors is stored in BOTH
        // sides' contour buckets (see SectorRegistry.ts:289-302) -- emit it
        // only from the lower-id side. A void far side is never doubled (a
        // void pixel has no contour bucket of its own), so it's always an
        // emit-candidate from this single bucket.
        if (farId !== VOID_ID && id > farId) continue

        const gA = mapping[id]
        const gB = farId === VOID_ID ? VOID_GROUP : mapping[farId]
        // Both sides void (sentinel) -> no edge. Otherwise emit iff the two
        // sides' groups differ (a grouped/void pairing always qualifies).
        if (gA === VOID_GROUP && gB === VOID_GROUP) continue
        if (gA === gB) continue

        const o = n * 4
        edges[o] = x1
        edges[o + 1] = y1
        edges[o + 2] = x2
        edges[o + 3] = y2
        n++
      }
      await yieldIfNeeded(yieldState)
    }

    count[0] = n

    // Cast rationale: see aggregationHandlers.ts/anchorHandlers.ts -- this
    // project's `lib` config has no `webworker` entry, so `self.postMessage`'s
    // typed overload set resolves to `Window`'s, whose 3-arg form wants a
    // string `targetOrigin`, not a Transferable[].
    ;(self.postMessage as (message: unknown, transfer: Transferable[]) => void)(
      { type: 'borderEdges', edges, count } satisfies WorkerMessage,
      [edges.buffer, count.buffer]
    )
  })
})
