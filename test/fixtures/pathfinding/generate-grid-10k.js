// test/fixtures/pathfinding/generate-grid-10k.js
// Generates grid-10k.json: a 100x100 4-connected grid graph (10,000 nodes)
// with deterministic traversal costs (mulberry32, seed=42), a carved
// low-cost serpentine corridor forcing a >=500-node cost-optimal path, a
// walled-off disconnected sub-region (edges omitted, never cost-based) for
// unreachability testing, and 50 start/end pairs with reference-Dijkstra
// expectedCost values (null = unreachable).
// Run from the repo root: node test/fixtures/pathfinding/generate-grid-10k.js
//
// Cost semantics (normative, shared with src/worker/SpatialGraph.ts): the
// cost of traversing edge a -> b is traversalCosts[b] (the cost of entering
// b); a path's total cost is the sum over every node entered, the start
// node's own cost excluded.

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { writeFileSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const WIDTH = 100
const HEIGHT = 100
const TOTAL = WIDTH * HEIGHT

function index(r, c) {
  return r * WIDTH + c
}

// ---- mulberry32: hand-rolled deterministic PRNG (seed=42). No PRNG
// package is installed; this inline generator guarantees the script always
// reproduces identical bytes. ----
function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(42)

// ---- traversalCosts: 1-255 (never 0), per-node, via the PRNG above ----
const traversalCosts = new Array(TOTAL)
for (let i = 0; i < TOTAL; i++) {
  traversalCosts[i] = 1 + Math.floor(rand() * 255)
}

// ---- disconnected sub-region: a 10x10 rectangle (rows/cols 60-69) walled
// off by omitting every boundary-crossing edge from the CSR adjacency
// arrays. traversalCosts never encodes impassability -- finite edge costs
// can never make a connected node unreachable to A*, so unreachability must
// come from graph disconnection. ----
const REGION_R0 = 60
const REGION_R1 = 69
const REGION_C0 = 60
const REGION_C1 = 69
function insideRegion(r, c) {
  return r >= REGION_R0 && r <= REGION_R1 && c >= REGION_C0 && c <= REGION_C1
}

// ---- serpentine corridor: full-width (0..49) lanes on every *even* row,
// separated by buffer rows on every *odd* row. A full-width lane placed on
// an *adjacent* row to another full-width lane would be a fatal design bug:
// every column would then have two cost-1 cells one row apart, collapsing
// the intended snake into a trivial straight-line shortcut. Separating
// lanes with a buffer row (cost 255 except a single connector column)
// eliminates that chord, so the only cost-1 route between the corridor's
// two ends is the full ~611-node snake. The corridor is further sealed by a
// cost-255 wall on its two open sides (rows 0 and columns 0 are already the
// grid's own edge). ----
const CORRIDOR_LANES = 12
const CORRIDOR_WIDTH = 50 // columns 0..49
const CORRIDOR_WALL_COL = CORRIDOR_WIDTH // column 50 (right wall)

const lastLane = CORRIDOR_LANES - 1
const lastLaneRow = lastLane * 2
const lastLaneEndCol = lastLane % 2 === 0 ? CORRIDOR_WIDTH - 1 : 0
const CORRIDOR_WALL_ROW = lastLaneRow + 1 // row 23 (bottom wall)

const CORRIDOR_START = index(0, 0)
const CORRIDOR_END = index(lastLaneRow, lastLaneEndCol)

const corridorCells = new Set()
// lanes: full-width rows 0,2,...,22, alternating direction (direction only
// matters for documentation here -- the connector wiring below is what
// actually constrains traversal order)
for (let lane = 0; lane < CORRIDOR_LANES; lane++) {
  const r = lane * 2
  for (let c = 0; c < CORRIDOR_WIDTH; c++) corridorCells.add(index(r, c))
}
// buffer rows: single connector column, matching the end column of the
// preceding lane (even lanes end at col 49, odd lanes end at col 0)
for (let lane = 0; lane < CORRIDOR_LANES - 1; lane++) {
  const bufferRow = lane * 2 + 1
  const connectorCol = lane % 2 === 0 ? CORRIDOR_WIDTH - 1 : 0
  corridorCells.add(index(bufferRow, connectorCol))
}

// force buffer-row non-connector cells to max cost (255) -- these are the
// walls that prevent the two adjacent lanes they separate from chording
for (let lane = 0; lane < CORRIDOR_LANES - 1; lane++) {
  const bufferRow = lane * 2 + 1
  const connectorCol = lane % 2 === 0 ? CORRIDOR_WIDTH - 1 : 0
  for (let c = 0; c < CORRIDOR_WIDTH; c++) {
    if (c !== connectorCol) traversalCosts[index(bufferRow, c)] = 255
  }
}
// right wall + bottom wall seal the corridor's two open sides (top and left
// are already the grid's own boundary)
for (let r = 0; r <= CORRIDOR_WALL_ROW; r++) {
  traversalCosts[index(r, CORRIDOR_WALL_COL)] = 255
}
for (let c = 0; c <= CORRIDOR_WALL_COL; c++) {
  traversalCosts[index(CORRIDOR_WALL_ROW, c)] = 255
}
// corridor cells themselves: cost 1 (applied last so it always wins over
// the wall/PRNG passes above)
for (const idx of corridorCells) traversalCosts[idx] = 1

// ---- CSR adjacency: 4-connected grid, excluding edges that cross into or
// out of the disconnected sub-region. Corridor/wall cells keep their normal
// adjacency -- only cost distinguishes them; the region is the only place
// edges are actually removed. ----
const neighborLists = new Array(TOTAL)
for (let r = 0; r < HEIGHT; r++) {
  for (let c = 0; c < WIDTH; c++) {
    const i = index(r, c)
    const list = []
    const candidates = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ]
    for (const [nr, nc] of candidates) {
      if (nr < 0 || nr >= HEIGHT || nc < 0 || nc >= WIDTH) continue
      if (insideRegion(r, c) !== insideRegion(nr, nc)) continue // walled boundary
      list.push(index(nr, nc))
    }
    neighborLists[i] = list
  }
}

const adjacencyPointers = new Array(TOTAL + 1)
const adjacencyNeighbors = []
adjacencyPointers[0] = 0
for (let i = 0; i < TOTAL; i++) {
  for (const n of neighborLists[i]) adjacencyNeighbors.push(n)
  adjacencyPointers[i + 1] = adjacencyNeighbors.length
}

// ---- reference Dijkstra (binary heap over plain arrays/tuples) ----
function dijkstra(start) {
  const dist = new Float64Array(TOTAL).fill(Infinity)
  const prev = new Int32Array(TOTAL).fill(-1)
  const visited = new Uint8Array(TOTAL)
  dist[start] = 0

  const heap = [[0, start]]
  function heapPush(item) {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (heap[parent][0] <= heap[i][0]) break
      ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
      i = parent
    }
  }
  function heapPop() {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length > 0) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = i * 2 + 1
        const r = i * 2 + 2
        let smallest = i
        if (l < heap.length && heap[l][0] < heap[smallest][0]) smallest = l
        if (r < heap.length && heap[r][0] < heap[smallest][0]) smallest = r
        if (smallest === i) break
        ;[heap[smallest], heap[i]] = [heap[i], heap[smallest]]
        i = smallest
      }
    }
    return top
  }

  while (heap.length > 0) {
    const [d, node] = heapPop()
    if (visited[node]) continue
    visited[node] = 1
    if (d > dist[node]) continue
    const from = adjacencyPointers[node]
    const to = adjacencyPointers[node + 1]
    for (let k = from; k < to; k++) {
      const neighbor = adjacencyNeighbors[k]
      if (visited[neighbor]) continue
      const cand = d + traversalCosts[neighbor]
      if (cand < dist[neighbor]) {
        dist[neighbor] = cand
        prev[neighbor] = node
        heapPush([cand, neighbor])
      }
    }
  }
  return { dist, prev }
}

function pathLength(prev, start, end) {
  if (start === end) return 1
  if (prev[end] === -1) return 0
  let count = 1
  let cur = end
  while (cur !== start) {
    cur = prev[cur]
    if (cur === -1) return 0
    count++
  }
  return count
}

// ---- pairs: corridor pair (>=500-node path), disconnected pair
// (unreachable), plus 48 general random pairs (same seed stream) ----
const REGION_OUTSIDE_SAMPLE = index(50, 50) // outside the region and the corridor
const REGION_CENTER = index(65, 65) // inside the region

const pairs = []

// 1) corridor pair -- forces a long, cost-optimal serpentine path
{
  const { dist, prev } = dijkstra(CORRIDOR_START)
  const cost = dist[CORRIDOR_END]
  const nodeCount = pathLength(prev, CORRIDOR_START, CORRIDOR_END)
  if (!(nodeCount >= 500)) {
    throw new Error(
      `Corridor pair path has ${nodeCount} nodes, expected >= 500 (start=${CORRIDOR_START}, end=${CORRIDOR_END})`
    )
  }
  if (!Number.isFinite(cost)) {
    throw new Error('Corridor pair unexpectedly unreachable')
  }
  pairs.push({ start: CORRIDOR_START, end: CORRIDOR_END, expectedCost: cost })
}

// 2) disconnected pair -- one endpoint inside the walled-off region, one outside
{
  const { dist } = dijkstra(REGION_OUTSIDE_SAMPLE)
  const cost = dist[REGION_CENTER]
  if (Number.isFinite(cost)) {
    throw new Error(
      `Disconnected pair unexpectedly reachable (cost=${cost}); region walling failed`
    )
  }
  pairs.push({
    start: REGION_OUTSIDE_SAMPLE,
    end: REGION_CENTER,
    expectedCost: null,
  })
}

// 3) 48 general random pairs, continuing the same PRNG stream
const specialKeys = new Set([
  `${CORRIDOR_START}-${CORRIDOR_END}`,
  `${REGION_OUTSIDE_SAMPLE}-${REGION_CENTER}`,
])
while (pairs.length < 50) {
  const start = Math.floor(rand() * TOTAL)
  const end = Math.floor(rand() * TOTAL)
  if (start === end) continue
  const key = `${start}-${end}`
  if (specialKeys.has(key)) continue
  specialKeys.add(key)
  const { dist } = dijkstra(start)
  const cost = dist[end]
  pairs.push({ start, end, expectedCost: Number.isFinite(cost) ? cost : null })
}

if (pairs.length !== 50)
  throw new Error(`Expected 50 pairs, got ${pairs.length}`)

const fixture = {
  width: WIDTH,
  height: HEIGHT,
  adjacencyPointers,
  adjacencyNeighbors,
  traversalCosts,
  pairs,
}

writeFileSync(join(__dirname, 'grid-10k.json'), JSON.stringify(fixture))

console.log(
  `Generated test/fixtures/pathfinding/grid-10k.json ` +
    `(${TOTAL} nodes, ${adjacencyNeighbors.length} directed edges, ${pairs.length} pairs)`
)
