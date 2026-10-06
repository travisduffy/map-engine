/**
 * Out-of-band peak-allocation sampler for bench/registry-alloc.spec.ts.
 *
 * `SectorRegistry`'s constructor is one synchronous block with no yield point,
 * so nothing on its own thread can observe the moment the transient pixel lists
 * and their typed-array conversions are both alive. This runs as a real OS
 * thread and polls while that block executes.
 *
 * It samples `rss` and nothing else, deliberately. `process.memoryUsage()`'s
 * `heapUsed`, `heapTotal`, `external`, and `arrayBuffers` are read from the
 * *calling thread's own V8 isolate* — a sampler polling them here would report
 * its own idle heap, not the constructor's. Only `rss` is process-wide.
 * Measured on Node v26.5.0: with the main thread holding 270 MB heapUsed, this
 * thread reported 7.8 MB. The heap/ArrayBuffer split therefore belongs to the
 * retained sample, which the main thread takes for itself.
 *
 * Plain `.mjs` rather than `.ts`: node:worker_threads loads this file directly,
 * with no Playwright TypeScript transform in the path.
 */
import { parentPort, workerData } from 'node:worker_threads'

if (parentPort === null) {
  throw new Error(
    'rss-sampler.mjs must be loaded as a worker thread, not as a main module.'
  )
}
const port = parentPort

const intervalMs = Number(workerData?.intervalMs ?? 5)

let peakRss = 0
let samples = 0

const timer = setInterval(() => {
  const rss = process.memoryUsage.rss()
  if (rss > peakRss) peakRss = rss
  samples++
}, intervalMs)

port.on('message', message => {
  if (message !== 'stop') return
  clearInterval(timer)
  port.postMessage({ peakRss, samples, intervalMs })
})

port.postMessage({ ready: true })
