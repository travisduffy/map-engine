import { describe, it, expect } from 'vitest'

import { PathNotFoundError } from '../src/shared/errors'
import { SharedRegistryProxy } from '../src/worker/SharedRegistryProxy'
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

function makeSnapshot() {
  return {
    bboxes: new Int16Array([0, 0, 1, 1, 2, 2, 3, 3]),
    centroids: new Int16Array([0, 0, 2, 2]),
    adjacencyPointers: new Uint32Array([0, 1, 2]),
    adjacencyNeighbors: new Uint16Array([1, 0]),
  }
}

describe('SharedRegistryProxy — Epic 3 Task 3.1', () => {
  it('correlates out-of-order RESULT responses to the correct Promise by id', async () => {
    const worker = new FakeWorker()
    const proxy = new SharedRegistryProxy(
      worker as unknown as Worker,
      makeSnapshot()
    )

    const p1 = proxy.call('methodA')
    const p2 = proxy.call('methodB')
    const p3 = proxy.call('methodC')

    expect(worker.sent).toHaveLength(3)
    const [id1, id2, id3] = worker.sent.map(m => ('id' in m ? m.id : -1))

    // Reply out of order: 3, 1, 2
    worker.reply({ type: 'RESULT', id: id3, result: 'C' })
    worker.reply({ type: 'RESULT', id: id1, result: 'A' })
    worker.reply({ type: 'RESULT', id: id2, result: 'B' })

    expect(await p1).toBe('A')
    expect(await p2).toBe('B')
    expect(await p3).toBe('C')
  })

  it('rehydrates a named ERROR into a typed rejection (instanceof preserved)', async () => {
    const worker = new FakeWorker()
    const proxy = new SharedRegistryProxy(
      worker as unknown as Worker,
      makeSnapshot()
    )

    const p = proxy.call('findPath')
    const id = (worker.sent[0] as { id: number }).id
    worker.reply({
      type: 'ERROR',
      id,
      errorName: 'PathNotFoundError',
      message: 'No path exists between sector 1 and sector 2.',
    })

    await expect(p).rejects.toBeInstanceOf(PathNotFoundError)
    await expect(p).rejects.toThrow(
      'No path exists between sector 1 and sector 2.'
    )
  })

  it('applies RESULT.snapshot before resolving — sync reads reflect the refreshed snapshot', async () => {
    const worker = new FakeWorker()
    const proxy = new SharedRegistryProxy(
      worker as unknown as Worker,
      makeSnapshot()
    )

    expect(proxy.getBBoxByNumericId(0)).toEqual([0, 0, 1, 1])

    const p = proxy.call('mutate')
    const id = (worker.sent[0] as { id: number }).id

    let bboxAtResolveTime: number[] | undefined
    p.then(() => {
      bboxAtResolveTime = proxy.getBBoxByNumericId(0)
    })

    worker.reply({
      type: 'RESULT',
      id,
      result: 'ok',
      snapshot: { bboxes: new Int16Array([9, 9, 9, 9, 2, 2, 3, 3]) },
    })

    await p
    // Flush the .then() microtask registered above.
    await Promise.resolve()
    expect(bboxAtResolveTime).toEqual([9, 9, 9, 9])
    expect(proxy.getBBoxByNumericId(0)).toEqual([9, 9, 9, 9])
  })

  it('rejectAll rejects every in-flight call and clears the pending map', async () => {
    const worker = new FakeWorker()
    const proxy = new SharedRegistryProxy(
      worker as unknown as Worker,
      makeSnapshot()
    )

    const p1 = proxy.call('a')
    const p2 = proxy.call('b')

    proxy.rejectAll(new Error('invalidated'))

    await expect(p1).rejects.toThrow('invalidated')
    await expect(p2).rejects.toThrow('invalidated')
  })
})
