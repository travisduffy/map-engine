import { registerCallHandler } from './callHandlers'
import { getWorkerState } from './state'
import { SpatialGraph } from './SpatialGraph'
import { CostsRequiredError } from '../errors'

let graph: SpatialGraph | null = null

/**
 * FIFO serialization (CA-4): `findPath` awaits `yieldIfNeeded` mid-search,
 * so the Worker keeps processing further `CALL` messages while one is in
 * flight. A second concurrent `findPath` (or a `setTraversalCosts` rebuild)
 * would interleave on `SpatialGraph`'s shared preallocated scratch arrays
 * and corrupt both. Both handlers chain onto this single promise so
 * searches/rebuilds always run one at a time in call order -- callers
 * still receive independent Promises.
 */
let chain: Promise<unknown> = Promise.resolve()

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = chain.then(fn, fn)
  // Never let one entry's rejection break the chain for later entries --
  // the rejection itself is still delivered to this entry's own caller via
  // the returned `result`.
  chain = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

registerCallHandler('setTraversalCosts', (params): Promise<void> => {
  const costs = params as Uint8Array
  return enqueue(async () => {
    const state = getWorkerState()
    if (!state) throw new Error('setTraversalCosts: Worker not bootstrapped')
    if (costs.length !== state.sectorCount) {
      throw new Error(
        `setTraversalCosts: costs.length (${costs.length}) !== sectorCount (${state.sectorCount})`
      )
    }
    graph = new SpatialGraph(
      state.adjacencyPointers,
      state.adjacencyNeighbors,
      costs,
      state.centroids
    )
  })
})

registerCallHandler('findPath', (params): Promise<Uint16Array> => {
  const { startId, endId } = params as { startId: number; endId: number }
  return enqueue(async () => {
    const state = getWorkerState()
    // Defensive fallback only -- the authoritative CostsRequiredError
    // enforcement lives on Main (SharedRegistryProxy.call resolution
    // tracking), since Worker-side state can't distinguish "never set" from
    // "a setTraversalCosts call is still in flight ahead of this one".
    if (!state || !graph) throw new CostsRequiredError()
    if (
      !Number.isInteger(startId) ||
      !Number.isInteger(endId) ||
      startId < 0 ||
      endId < 0 ||
      startId >= state.sectorCount ||
      endId >= state.sectorCount
    ) {
      throw new Error(
        `findPath: startId/endId must be integers in [0, ${state.sectorCount}) — got (${startId}, ${endId})`
      )
    }
    return graph.findPath(startId, endId)
  })
})
