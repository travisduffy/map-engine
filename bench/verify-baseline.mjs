/**
 * Checks `bench/baselines.json`'s newest `b1.registry_scan` entry against the
 * raw `bench/.last-result.json` the benchmark actually emitted.
 *
 * The two are kept in sync by hand — the benchmark writes raw numbers, a human
 * curates them into baselines.json with hardware notes and caveats. Nothing
 * previously checked that the transcription was faithful, so a typo could
 * promote a wrong figure into the file the README quotes.
 *
 * Fields are checked according to how deterministic they actually are:
 *
 *   - `retained_arraybuffer_delta_bytes` is the sum of the typed arrays the
 *     scan allocates, so it reproduces byte for byte. Compared exactly.
 *   - RSS figures move run to run — they are process-wide and include the
 *     sampler's own isolate and whatever the allocator has not returned — so
 *     they get a wide band that catches a transposed digit or a wrong order of
 *     magnitude without failing on ordinary variance.
 *   - Wall-clock is reported only. It varies with machine load by design,
 *     which is why the benchmark keeps the best of N in the first place.
 *
 * Usage: npm run bench:verify   (after npm run bench:registry-alloc)
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = process.cwd()
const lastResult = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'bench/.last-result.json'), 'utf8')
)
const baselines = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'bench/baselines.json'), 'utf8')
)

const scan = baselines['b1.registry_scan']
if (!scan) {
  console.error('verify-baseline: b1.registry_scan missing from baselines.json')
  process.exit(1)
}

/** Sub-entries are the ones carrying a capturedAt; newest wins. */
const entries = Object.entries(scan).filter(
  ([, v]) => v && typeof v === 'object' && typeof v.capturedAt === 'string'
)
if (entries.length === 0) {
  console.error('verify-baseline: no dated entries under b1.registry_scan')
  process.exit(1)
}
entries.sort(([, a], [, b]) => (a.capturedAt < b.capturedAt ? 1 : -1))
const [newestName, newest] = entries[0]

/** Deterministic for a given implementation and fixture. */
const EXACT_FIELDS = [
  ['retained_arraybuffer_delta_bytes', 'retainedArrayBufferDeltaBytes'],
  ['sampler_interval_ms', 'samplerIntervalMs'],
  ['coverage', 'coverage'],
]

/** Real but noisy. The band catches typos, not variance. */
const BANDED_FIELDS = [
  ['peak_rss_delta_bytes', 'peakRssDeltaBytes'],
  ['retained_rss_delta_bytes', 'retainedRssDeltaBytes'],
]
const BAND = 0.3

const SIZE_KEYS = {
  '4096x4096_1k_sectors': 'sectors_1000',
  '4096x4096_10k_sectors': 'sectors_10000',
}

console.log(`verify-baseline: newest entry is b1.registry_scan.${newestName}`)

let failures = 0
let compared = 0

for (const [baselineKey, resultKey] of Object.entries(SIZE_KEYS)) {
  const recorded = newest[baselineKey]
  const actual = lastResult[resultKey]
  if (!recorded) continue
  if (!actual) {
    console.error(
      `  ${baselineKey}: recorded, but ${resultKey} is absent from .last-result.json ` +
        `— re-run npm run bench:registry-alloc so both fixture sizes are present`
    )
    failures++
    continue
  }

  compared++
  for (const [recordedField, actualField] of EXACT_FIELDS) {
    if (recorded[recordedField] !== actual[actualField]) {
      console.error(
        `  ${baselineKey}.${recordedField}: baselines has ${recorded[recordedField]}, ` +
          `last run produced ${actual[actualField]}`
      )
      failures++
    }
  }

  for (const [recordedField, actualField] of BANDED_FIELDS) {
    const r = recorded[recordedField]
    const a = actual[actualField]
    if (typeof r !== 'number' || typeof a !== 'number') continue
    if (Math.abs(a - r) > Math.abs(r) * BAND) {
      console.error(
        `  ${baselineKey}.${recordedField}: baselines has ${r}, last run produced ${a} ` +
          `— outside the ${BAND * 100}% band, so this is a transcription error or a stale baseline`
      )
      failures++
    }
  }

  const recordedMs = recorded.scan_ms_best_of_3
  const actualMs = Number(actual.scanMsMin.toFixed(1))
  const driftPct = ((actualMs - recordedMs) / recordedMs) * 100
  console.log(
    `  ${baselineKey}: scan ${recordedMs} ms recorded vs ${actualMs} ms last run ` +
      `(${driftPct >= 0 ? '+' : ''}${driftPct.toFixed(1)}%, informational)`
  )
}

if (compared === 0) {
  console.error('verify-baseline: nothing to compare')
  process.exit(1)
}
if (failures > 0) {
  console.error(
    `\nverify-baseline: ${failures} mismatch(es). Either the transcription is ` +
      `wrong, or the baseline predates the current implementation and needs re-recording.`
  )
  process.exit(1)
}
console.log('verify-baseline: OK')
