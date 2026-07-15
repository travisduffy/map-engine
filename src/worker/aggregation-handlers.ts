import { MappingRequiredError } from '../shared/errors'
import { registerCallHandler } from './call-handlers'
import { getWorkerState } from './state'
import { yieldIfNeeded } from './yield'
import type { WorkerMessage } from '../shared/types'

/** Sentinel mapping entry: the sector belongs to no group (excluded from aggregation). */
const VOID_GROUP = 0xffff

// Current sector→group mapping; null until the first setParentMapping resolves.
let mapping: Uint16Array | null = null
/** -1 is not a valid `maxGroups` value, so the first `setParentMapping` call always (re)allocates. */
let maxGroups = -1

/**
 * Worker-side ring bookkeeping (F-C.8): a free list of reclaimed buffers,
 * reused ahead of allocating new ones. `aggregateGroups` is FIFO-serialized
 * via `chain` below and only issued on user demand, so in practice at most
 * two buffers are outstanding (Main-current + Main-pending-bounce) --
 * steady state never approaches the 4-buffers-total budget.
 */
let freeBuffers: Int16Array[] = []

/**
 * FIFO serialization (mirrors CA-4's `pathfindingHandlers` pattern):
 * `setParentMapping` and `aggregateGroups` share `mapping`/the ring pool, so
 * both handlers chain onto this single promise to run one at a time in call
 * order -- callers still receive independent Promises.
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

/** Pops a reclaimed buffer off the free list, or allocates a fresh one sized for the current `maxGroups`. */
function takeBuffer(): Int16Array {
  return freeBuffers.pop() ?? new Int16Array(maxGroups * 4)
}

/** Reclaims a bounced-back buffer (F-C.7). Called from the Worker entry's `returnGroupBBoxes` case. */
export function handleReturnGroupBBoxes(buffer: Int16Array): void {
  freeBuffers.push(buffer)
}

/**
 * Read access to the current `parentMapping` for `borderHandlers.ts` (CA-6):
 * `mapping` is this module's own private state, not part of `getWorkerState()`,
 * so border extraction has no other way to reach it. Returns `null` if
 * `setParentMapping` has never resolved.
 */
export function getParentMapping(): Uint16Array | null {
  return mapping
}

/**
 * `setParentMapping` CALL handler (CA-5): validates `mapping` against
 * `sectorCount`/`maxGroups` and stores it. A changed `maxGroups` discards
 * the free list and notifies Main via `INIT_GROUPS` so the ring pool
 * reallocates.
 */
registerCallHandler('setParentMapping', (params): Promise<void> => {
  const { mapping: newMapping, maxGroups: newMaxGroups } = params as {
    mapping: Uint16Array
    maxGroups: number
  }
  return enqueue(async () => {
    const state = getWorkerState()
    if (!state) throw new Error('setParentMapping: Worker not bootstrapped')
    if (newMapping.length !== state.sectorCount) {
      throw new Error(
        `setParentMapping: mapping.length (${newMapping.length}) !== sectorCount (${state.sectorCount})`
      )
    }
    for (let i = 0; i < newMapping.length; i++) {
      const g = newMapping[i]
      if (g !== VOID_GROUP && g >= newMaxGroups) {
        throw new Error(
          `setParentMapping: mapping[${i}] (${g}) must be exactly 0xFFFF or < maxGroups (${newMaxGroups})`
        )
      }
    }
    // A changed maxGroups invalidates the existing pool's buffers -- they're
    // sized for the old bound. Reallocate and notify Main via a fresh INIT_GROUPS.
    if (newMaxGroups !== maxGroups) {
      freeBuffers = []
      maxGroups = newMaxGroups
      self.postMessage({
        type: 'INIT_GROUPS',
        maxGroups,
      } satisfies WorkerMessage)
    }
    mapping = newMapping
  })
})

/**
 * `aggregateGroups` CALL handler (CA-5): folds every member sector's bbox
 * into one aggregate bbox per group (yielding cooperatively) and pushes the
 * buffer to Main as a Transferable `groupBBoxes` handoff. Rejects with
 * `MappingRequiredError` before the first `setParentMapping` resolves.
 */
registerCallHandler('aggregateGroups', (): Promise<void> => {
  return enqueue(async () => {
    const state = getWorkerState()
    if (!state || !mapping) {
      throw new MappingRequiredError(
        'aggregateGroups: setParentMapping() must resolve before aggregateGroups() is called.'
      )
    }
    const buffer = takeBuffer()
    for (let g = 0; g < maxGroups; g++) {
      const o = g * 4
      buffer[o] = 32767
      buffer[o + 1] = 32767
      buffer[o + 2] = -32768
      buffer[o + 3] = -32768
    }

    const { bboxes, sectorCount } = state
    const yieldState = { lastYield: performance.now() }
    for (let i = 0; i < sectorCount; i++) {
      const g = mapping[i]
      if (g !== VOID_GROUP) {
        const so = i * 4
        const go = g * 4
        if (bboxes[so] < buffer[go]) buffer[go] = bboxes[so]
        if (bboxes[so + 1] < buffer[go + 1]) buffer[go + 1] = bboxes[so + 1]
        if (bboxes[so + 2] > buffer[go + 2]) buffer[go + 2] = bboxes[so + 2]
        if (bboxes[so + 3] > buffer[go + 3]) buffer[go + 3] = bboxes[so + 3]
      }
      await yieldIfNeeded(yieldState)
    }

    // `self` resolves to the `Window` postMessage overload set under this
    // project's lib config (no `webworker` lib) -- its 3-arg overload wants a
    // string `targetOrigin`, not a Transferable[]. This project's Worker
    // build target really is a DedicatedWorkerGlobalScope, where
    // `postMessage(message, transfer)` is valid; cast through the
    // 2-argument signature that actually applies here.
    ;(self.postMessage as (message: unknown, transfer: Transferable[]) => void)(
      { type: 'groupBBoxes', buffer } satisfies WorkerMessage,
      [buffer.buffer]
    )
  })
})
