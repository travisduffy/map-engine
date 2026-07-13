import { describe, it, expect } from 'vitest'
import { MapEngine } from '../../src/core/MapEngine'
import type { MapRenderer } from '../../src/core/MapRenderer'
import { makeCanvas } from '../testUtils'
import type { WorkerMessage } from '../../src/shared/types'

const TEST4X4_BITMAP = '/test/fixtures/test-4x4.png'
const TEST4X4_DEFINITION = '/test/fixtures/test-4x4.json'

/**
 * 1,000-frame perimeter-mutation soak (Epic 8 Task 8.4, F-4.8/F-4.9, PRD
 * Known Risk 3 falsifier). Alternates `setParentMapping`/`recomputeBorders`
 * across 1,000 iterations, driven ASYNCHRONOUSLY by awaiting each mutation
 * plus a direct `_preRenderHook`/`_postRenderHook` call per iteration --
 * never via real `requestAnimationFrame` (1,000 real rAF frames is ~16.7s
 * wall-clock, unnecessarily slow/flaky) and never via fake timers driving
 * the Worker synchronously (the Worker is a real thread; blasting through
 * 1,000 iterations without yielding to it would only produce a couple of
 * coalesced extractions and never soak the bounce-back loop). Critically,
 * `_postRenderHook` is called explicitly here -- `advanceFrame` in
 * testUtils.ts only drives `_preRenderHook`, so reusing that helper alone
 * would never exercise the bounce-back path this soak exists to stress
 * (Known Risk 3: an unflushed pending buffer starves the Worker's free
 * list, which would eventually surface as a hang or a detached-buffer
 * transfer failure well before 1,000 iterations complete).
 */
describe('Borders soak — Epic 8 Task 8.4 (F-4.8/F-4.9, Known Risk 3)', () => {
  it('1,000-frame perimeter-mutation soak: zero detachment errors, stable (drained) pool', async () => {
    const canvas = makeCanvas()
    const engine = new MapEngine()
    try {
      await engine.loadMap({
        bitmapUrl: TEST4X4_BITMAP,
        definitionUrl: TEST4X4_DEFINITION,
        canvas,
      })
      const sectorCount = engine.getSectorKeys().length
      const renderer = engine['_renderer'] as MapRenderer
      const worker = engine['_worker'] as Worker

      // Count every 'borderEdges' handoff received vs every
      // 'returnBorderEdges' bounce-back sent. If these ever drift apart by
      // more than the single buffer legitimately in flight at any instant,
      // the ring pool is leaking (growing) rather than staying stable --
      // and any actual `ArrayBuffer is detached` DOMException from a
      // double-transferred/already-detached buffer would throw synchronously
      // out of the loop below, failing this test outright.
      let received = 0
      let sent = 0
      const onMessage = (e: MessageEvent<WorkerMessage>): void => {
        if (e.data.type === 'borderEdges') received++
      }
      worker.addEventListener('message', onMessage)
      const originalPostMessage = worker.postMessage.bind(worker)
      worker.postMessage = ((
        message: unknown,
        transfer?: Transferable[]
      ): void => {
        if ((message as WorkerMessage).type === 'returnBorderEdges') sent++
        return originalPostMessage(message, transfer ?? [])
      }) as typeof worker.postMessage

      try {
        // Alternates between "one group" (0 qualifying edges -- same group,
        // no boundary) and "every sector its own group" (edges at every
        // internal quadrant boundary) so the resolved segment count actually
        // changes shape every pass, not just the group id.
        const allOneGroup = new Uint16Array(sectorCount).fill(0)
        const eachOwnGroup = new Uint16Array(
          Array.from({ length: sectorCount }, (_, i) => i)
        )

        for (let i = 0; i < 1000; i++) {
          const mapping = i % 2 === 0 ? eachOwnGroup : allOneGroup
          const maxGroups = i % 2 === 0 ? sectorCount : 1
          await engine.setParentMapping(mapping.slice(), maxGroups)
          await engine.recomputeBorders()
          renderer['_preRenderHook']?.()
          renderer['_postRenderHook']?.()
        }
      } finally {
        worker.removeEventListener('message', onMessage)
        worker.postMessage = originalPostMessage
      }

      expect(received).toBe(1000)
      expect(sent).toBe(received) // fully drained -- no growth
      expect(engine.getBorderSegments()).not.toBeNull()
    } finally {
      engine.destroy()
      canvas.remove()
    }
  }, 30000)
})
