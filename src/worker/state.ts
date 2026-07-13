import type { BootstrapPayload } from '../shared/types'

/**
 * Worker-side registry state constructed from the BOOTSTRAP transfer.
 * Populated once; later epics (2, 3, 5–8) read/extend this to implement
 * SimulationClock, SharedRegistryProxy methods, pathfinding, aggregation,
 * anchoring, and border extraction.
 */
export type WorkerState = BootstrapPayload

let state: WorkerState | null = null

export function setWorkerState(payload: BootstrapPayload): void {
  state = payload
}

export function getWorkerState(): WorkerState | null {
  return state
}
