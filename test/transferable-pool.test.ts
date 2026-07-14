import { describe, it, expect, vi } from 'vitest'

import { MappingRequiredError } from '../src/shared/errors'
import { TransferableGroupPool } from '../src/worker/transferable-pool'
import type { WorkerMessage } from '../src/shared/types'

class FakeWorker extends EventTarget {
  sent: WorkerMessage[] = []
  postMessage(msg: WorkerMessage): void {
    this.sent.push(msg)
  }
  terminate(): void {}
  reply(msg: WorkerMessage): void {
    this.dispatchEvent(
      new MessageEvent('message', { data: msg }) as MessageEvent<WorkerMessage>
    )
  }
}

function groupBuffer(maxGroups: number, fill: number): Int16Array {
  const b = new Int16Array(maxGroups * 4)
  b.fill(fill)
  return b
}

describe('TransferableGroupPool — Epic 6 Task 6.1 (F-C.7/F-C.8)', () => {
  it('throws MappingRequiredError before the first handoff is received', () => {
    const worker = new FakeWorker()
    const pool = new TransferableGroupPool(worker as unknown as Worker, vi.fn())
    expect(() => pool.getGroupBBox(0)).toThrow(MappingRequiredError)
  })

  it('sync reads are valid across N consecutive handoffs', () => {
    const worker = new FakeWorker()
    const markDirty = vi.fn()
    const pool = new TransferableGroupPool(
      worker as unknown as Worker,
      markDirty
    )

    worker.reply({ type: 'INIT_GROUPS', maxGroups: 2 })

    for (let n = 1; n <= 5; n++) {
      const buffer = groupBuffer(2, n)
      worker.reply({ type: 'groupBBoxes', buffer })
      expect(pool.getGroupBBox(0)).toEqual([n, n, n, n])
      expect(pool.getGroupBBox(1)).toEqual([n, n, n, n])
      expect(markDirty).toHaveBeenCalledTimes(n)
    }
  })

  it('throws RangeError for a negative or out-of-bounds groupId', () => {
    const worker = new FakeWorker()
    const pool = new TransferableGroupPool(worker as unknown as Worker, vi.fn())
    worker.reply({ type: 'INIT_GROUPS', maxGroups: 3 })
    worker.reply({ type: 'groupBBoxes', buffer: groupBuffer(3, 0) })

    expect(() => pool.getGroupBBox(-1)).toThrow(RangeError)
    expect(() => pool.getGroupBBox(3)).toThrow(RangeError)
    expect(() => pool.getGroupBBox(1.5)).toThrow(RangeError)
    expect(() => pool.getGroupBBox(2)).not.toThrow()
  })

  it('flushBounces is a no-op until a second handoff makes a buffer pending, and never double-posts', () => {
    const worker = new FakeWorker()
    const pool = new TransferableGroupPool(worker as unknown as Worker, vi.fn())
    worker.reply({ type: 'INIT_GROUPS', maxGroups: 1 })

    // First handoff: nothing pending yet (there was no prior "current" to bounce).
    const first = groupBuffer(1, 1)
    worker.reply({ type: 'groupBBoxes', buffer: first })
    pool.flushBounces()
    expect(worker.sent).toHaveLength(0)

    // Second handoff makes `first` pending.
    const second = groupBuffer(1, 2)
    worker.reply({ type: 'groupBBoxes', buffer: second })
    pool.flushBounces()
    expect(worker.sent).toHaveLength(1)
    expect(worker.sent[0]).toEqual({
      type: 'returnGroupBBoxes',
      buffer: first,
    })

    // Calling again with nothing newly pending must not re-post.
    pool.flushBounces()
    expect(worker.sent).toHaveLength(1)

    // The current buffer (not the bounced one) still serves reads.
    expect(pool.getGroupBBox(0)).toEqual([2, 2, 2, 2])
  })

  it('a re-INIT_GROUPS (changed maxGroups) discards stale buffers', () => {
    const worker = new FakeWorker()
    const pool = new TransferableGroupPool(worker as unknown as Worker, vi.fn())
    worker.reply({ type: 'INIT_GROUPS', maxGroups: 1 })
    worker.reply({ type: 'groupBBoxes', buffer: groupBuffer(1, 7) })
    expect(pool.getGroupBBox(0)).toEqual([7, 7, 7, 7])

    worker.reply({ type: 'INIT_GROUPS', maxGroups: 4 })
    expect(() => pool.getGroupBBox(0)).toThrow(MappingRequiredError)

    worker.reply({ type: 'groupBBoxes', buffer: groupBuffer(4, 9) })
    expect(pool.getGroupBBox(3)).toEqual([9, 9, 9, 9])
    // The old bound (1) no longer applies -- id 3 is valid under the new pool.
    expect(() => pool.getGroupBBox(4)).toThrow(RangeError)
  })

  it('dispose() with a pending bounce does not throw and stops future updates', () => {
    const worker = new FakeWorker()
    const pool = new TransferableGroupPool(worker as unknown as Worker, vi.fn())
    worker.reply({ type: 'INIT_GROUPS', maxGroups: 1 })
    worker.reply({ type: 'groupBBoxes', buffer: groupBuffer(1, 1) })
    worker.reply({ type: 'groupBBoxes', buffer: groupBuffer(1, 2) }) // now a pending bounce exists

    expect(() => pool.dispose()).not.toThrow()

    // The listener is detached -- further messages must not resurrect state.
    worker.reply({ type: 'groupBBoxes', buffer: groupBuffer(1, 3) })
    expect(() => pool.getGroupBBox(0)).toThrow(MappingRequiredError)
  })
})
