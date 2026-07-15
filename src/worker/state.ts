import type { BootstrapPayload } from '../shared/types'

/**
 * Worker-side registry state constructed from the BOOTSTRAP transfer.
 * Populated once; later epics (2, 3, 5–8) read/extend this to implement
 * SimulationClock, SharedRegistryProxy methods, pathfinding, aggregation,
 * anchoring, and border extraction.
 */
export type WorkerState = BootstrapPayload

// Populated once per Worker lifetime, by the BOOTSTRAP message.
let state: WorkerState | null = null

/** Stores the BOOTSTRAP-transferred payload as the Worker's registry state. Called from the Worker entry's BOOTSTRAP case. */
export function setWorkerState(payload: BootstrapPayload): void {
  state = payload
}

/** The Worker-side registry state, or `null` before BOOTSTRAP. */
export function getWorkerState(): WorkerState | null {
  return state
}
