import type { WorkerMessage } from '../types'
import {
  MapInvalidatedError,
  WebGL2NotSupportedError,
  MappingRequiredError,
  PathNotFoundError,
  CostsRequiredError,
  ModeNotReadyError,
  SectorLimitExceededError,
} from '../errors'

/** Canonical error constructors keyed by `.name`, for `ERROR` rehydration. */
const ERROR_CTORS: Record<string, new (...args: never[]) => Error> = {
  WebGL2NotSupportedError,
  MappingRequiredError,
  PathNotFoundError,
  CostsRequiredError,
  ModeNotReadyError,
  MapInvalidatedError,
  SectorLimitExceededError,
}

/**
 * Rehydrates a Worker-side error by name without invoking the original
 * constructor (whose signatures vary — some take a message, some take
 * numeric/positional args) — `Object.create(ctor.prototype)` preserves
 * `instanceof` correctness while `.name`/`.message` are set directly.
 */
function rehydrateError(errorName: string, message: string): Error {
  const Ctor = ERROR_CTORS[errorName]
  const err = Ctor
    ? (Object.create(Ctor.prototype) as Error)
    : new Error(message)
  err.message = message
  err.name = errorName
  return err
}

/** Pre-transfer `.slice()` snapshots surviving the BOOTSTRAP buffer detach (ROADMAP §12.4). */
export interface RegistrySnapshotBuffers {
  bboxes: Int16Array
  centroids: Int16Array
  adjacencyPointers: Uint32Array
  adjacencyNeighbors: Uint16Array
}

interface PendingCall {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

/**
 * Main-thread facade over the Worker-resident registry (B3.c): correlates
 * `CALL`/`RESULT`/`ERROR` round-trips by monotonic `id`, refreshes snapshot
 * caches from `RESULT.snapshot` before resolving, and serves synchronous
 * `getBBox`/`getNeighbors`/`getCentroid` reads from those caches.
 */
export class SharedRegistryProxy {
  private readonly _worker: Worker
  private _nextId = 1
  private readonly _pending = new Map<number, PendingCall>()
  private _snapshot: RegistrySnapshotBuffers

  constructor(worker: Worker, snapshot: RegistrySnapshotBuffers) {
    this._worker = worker
    this._snapshot = snapshot
    this._worker.addEventListener('message', this._onMessage)
  }

  private _onMessage = (e: MessageEvent<WorkerMessage>): void => {
    const msg = e.data
    if (msg.type === 'RESULT') {
      const entry = this._pending.get(msg.id)
      if (!entry) return
      this._pending.delete(msg.id)
      if (msg.snapshot !== undefined) {
        this._snapshot = {
          ...this._snapshot,
          ...(msg.snapshot as Partial<RegistrySnapshotBuffers>),
        }
      }
      entry.resolve(msg.result)
    } else if (msg.type === 'ERROR') {
      const entry = this._pending.get(msg.id)
      if (!entry) return
      this._pending.delete(msg.id)
      entry.reject(rehydrateError(msg.errorName, msg.message))
    }
  }

  /** CALL/RESULT/ERROR round-trip, keyed by a monotonic id. */
  call<T = unknown>(
    method: string,
    params: unknown = null,
    transfer: Transferable[] = []
  ): Promise<T> {
    const id = this._nextId++
    return new Promise<T>((resolve, reject) => {
      this._pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      })
      this._worker.postMessage(
        { type: 'CALL', id, method, params } satisfies WorkerMessage,
        transfer
      )
    })
  }

  /** Rejects every in-flight call (lifecycle invalidation, Task 3.3). */
  rejectAll(error: Error): void {
    for (const entry of this._pending.values()) {
      entry.reject(error)
    }
    this._pending.clear()
  }

  getBBoxByNumericId(numId: number): [number, number, number, number] {
    const b = numId * 4
    const { bboxes } = this._snapshot
    return [bboxes[b], bboxes[b + 1], bboxes[b + 2], bboxes[b + 3]]
  }

  getCentroidByNumericId(numId: number): [number, number] {
    const { centroids } = this._snapshot
    return [centroids[numId * 2], centroids[numId * 2 + 1]]
  }

  getNeighborIdsByNumericId(numId: number): number[] {
    const { adjacencyPointers, adjacencyNeighbors } = this._snapshot
    const start = adjacencyPointers[numId]
    const end = adjacencyPointers[numId + 1]
    const result: number[] = []
    for (let i = start; i < end; i++) {
      result.push(adjacencyNeighbors[i])
    }
    return result
  }

  dispose(): void {
    this.rejectAll(new MapInvalidatedError())
    this._worker.removeEventListener('message', this._onMessage)
  }
}
