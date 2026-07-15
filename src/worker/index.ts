import { SimulationClock, type TickTelemetry } from './SimulationClock'
import { handleReturnGroupBBoxes } from './aggregation-handlers'
import { handleReturnAnchors } from './anchor-handlers'
import { handleReturnBorderEdges } from './border-handlers'
import { getCallHandler, registerCallHandler } from './call-handlers'
import './pathfinding-handlers'
import { setWorkerState } from './state'
import type { WorkerMessage, BootstrapAckPayload } from '../shared/types'

/** Reads sector `sectorId`'s `[minX, minY, maxX, maxY]` out of the flat SoA `bboxes` buffer. */
function bboxAt(
  bboxes: Int16Array,
  sectorId: number
): [number, number, number, number] {
  const b = sectorId * 4
  return [bboxes[b], bboxes[b + 1], bboxes[b + 2], bboxes[b + 3]]
}

// Constructed and started at BOOTSTRAP; null until the first BOOTSTRAP arrives.
let simulationClock: SimulationClock | null = null

/** `getTickTelemetry` CALL handler: snapshots the clock's tick count + timestamp ring (zeros before BOOTSTRAP). */
registerCallHandler('getTickTelemetry', (): TickTelemetry => {
  return simulationClock?.getTelemetry() ?? { tickCount: 0, timestamps: [] }
})

/**
 * Worker entry dispatcher. `BOOTSTRAP` stores the transferred registry
 * state, starts the SimulationClock, and replies `BOOTSTRAP_ACK`; `CALL`
 * routes to the registered handler and replies `RESULT`/`ERROR`; the
 * `return*` messages reclaim bounced-back ring buffers for their owning
 * handler modules.
 */
self.onmessage = (e: MessageEvent<WorkerMessage>): void => {
  const msg = e.data

  switch (msg.type) {
    case 'BOOTSTRAP': {
      setWorkerState(msg.payload)
      simulationClock = new SimulationClock(msg.payload.tickHz)
      simulationClock.start()
      const { sectorCount, adjacencyNeighbors, bboxes } = msg.payload
      const zeroBBox: [number, number, number, number] = [0, 0, 0, 0]
      const ack: BootstrapAckPayload = {
        sectorCount,
        totalEdges: adjacencyNeighbors.length,
        firstSectorBBox: sectorCount > 0 ? bboxAt(bboxes, 0) : zeroBBox,
        lastSectorBBox:
          sectorCount > 0 ? bboxAt(bboxes, sectorCount - 1) : zeroBBox,
      }
      self.postMessage({
        type: 'BOOTSTRAP_ACK',
        payload: ack,
      } satisfies WorkerMessage)
      break
    }

    case 'CALL': {
      const { id, method, params } = msg
      const handler = getCallHandler(method)
      if (!handler) {
        self.postMessage({
          type: 'ERROR',
          id,
          errorName: 'Error',
          message: `Unknown Worker CALL method: ${method}`,
        } satisfies WorkerMessage)
        return
      }
      Promise.resolve(handler(params)).then(
        result => {
          self.postMessage({
            type: 'RESULT',
            id,
            result,
          } satisfies WorkerMessage)
        },
        (err: unknown) => {
          self.postMessage({
            type: 'ERROR',
            id,
            errorName: err instanceof Error ? err.name : 'Error',
            message: err instanceof Error ? err.message : String(err),
          } satisfies WorkerMessage)
        }
      )
      break
    }

    case 'returnGroupBBoxes': {
      handleReturnGroupBBoxes(msg.buffer)
      break
    }

    case 'returnAnchors': {
      handleReturnAnchors(msg.buffer)
      break
    }

    case 'returnBorderEdges': {
      handleReturnBorderEdges(msg.edges, msg.count)
      break
    }

    default:
      break
  }
}
