import { PathNotFoundError } from '../errors'
import { yieldIfNeeded } from './yield'

/** Sentinel for "no predecessor" in `cameFrom` (§12.3) -- also the start node's own entry. */
const NO_PREDECESSOR = 0xffff

/**
 * Worker-resident A* over the CSR adjacency graph (CA-4). Zero DOM/Three.js
 * imports -- constructible inside the Worker from BOOTSTRAP-transferred
 * buffers (`adjacencyPointers`/`adjacencyNeighbors`/`centroids`) plus
 * consumer-supplied `traversalCosts`.
 *
 * All per-search scratch (`gScore`/`cameFrom`/`visited`/the open-set heap)
 * is preallocated once at construction and reset in place on each
 * `findPath()` call -- zero per-node object allocation during expansion
 * (PR-3). The open set is a binary heap over two parallel typed arrays
 * (node ids + f-scores); since a plain binary heap has no O(log n)
 * decrease-key, an improved node is pushed again rather than updated in
 * place (lazy decrease-key) -- the heap is sized to the total directed edge
 * count plus one, an exact upper bound on the number of pushes a single
 * search can perform. Stale duplicate entries are skipped via the
 * `visited` (closed-set) check on pop.
 *
 * Tie-break (explicit, since raw heap ordering is not stable): lower node
 * id wins on equal f-score.
 *
 * Cost semantics (normative, shared with the `grid-10k.json` fixture
 * generator): the cost of traversing edge a -> b is `traversalCosts[b]`
 * (the cost of entering b); a path's total cost is the sum over every node
 * entered, the start node's own cost excluded.
 */
export class SpatialGraph {
  private readonly _adjacencyPointers: Uint32Array
  private readonly _adjacencyNeighbors: Uint16Array
  private readonly _traversalCosts: Uint8Array
  private readonly _centroids: Int16Array
  private readonly _sectorCount: number

  /** Heuristic multiplier: `minEdgeCost / maxAdjacentCentroidDistance`, computed once at build time (§ below). */
  private readonly _heuristicMultiplier: number

  // Preallocated per-search scratch (reset in place on every findPath call).
  private readonly _gScore: Float32Array
  private readonly _cameFrom: Uint16Array
  private readonly _visited: Uint8Array
  private readonly _heapNode: Uint16Array
  private readonly _heapScore: Float32Array
  private _heapSize = 0

  constructor(
    adjacencyPointers: Uint32Array,
    adjacencyNeighbors: Uint16Array,
    traversalCosts: Uint8Array,
    centroids: Int16Array
  ) {
    this._adjacencyPointers = adjacencyPointers
    this._adjacencyNeighbors = adjacencyNeighbors
    this._traversalCosts = traversalCosts
    this._centroids = centroids
    this._sectorCount = adjacencyPointers.length - 1

    this._gScore = new Float32Array(this._sectorCount)
    this._cameFrom = new Uint16Array(this._sectorCount)
    this._visited = new Uint8Array(this._sectorCount)
    // Upper bound on pushes: one per directed edge relaxation, plus the initial start push.
    const heapCapacity = adjacencyNeighbors.length + 1
    this._heapNode = new Uint16Array(heapCapacity)
    this._heapScore = new Float32Array(heapCapacity)

    this._heuristicMultiplier = this._computeHeuristicMultiplier()
  }

  /**
   * `h(n) = euclideanDistance(centroid(n), centroid(goal)) * multiplier` --
   * multiply, never divide (dividing by cost would divide-by-zero if a 0
   * cost ever appeared). Admissibility (`h(n) <= true remaining cost`)
   * constrains the multiplier by distance, not just cost: on a real map,
   * adjacent centroids can be many pixels apart while edge costs stay near
   * 1, so a naive multiplier of 1 wildly overestimates. The multiplier
   * computed here -- `minEdgeCost / maxAdjacentCentroidDistance`, in one
   * O(E) pass -- keeps the heuristic admissible for any edge in the graph.
   * Clamped to 0 if the graph has no adjacent-centroid distance (empty
   * graph, or all-coincident centroids), preventing `Infinity`.
   */
  private _computeHeuristicMultiplier(): number {
    let minEdgeCost = Infinity
    let maxAdjacentCentroidDistance = 0
    for (let node = 0; node < this._sectorCount; node++) {
      const from = this._adjacencyPointers[node]
      const to = this._adjacencyPointers[node + 1]
      for (let k = from; k < to; k++) {
        const neighbor = this._adjacencyNeighbors[k]
        const cost = this._traversalCosts[neighbor]
        if (cost < minEdgeCost) minEdgeCost = cost
        const dist = this._centroidDistance(node, neighbor)
        if (dist > maxAdjacentCentroidDistance)
          maxAdjacentCentroidDistance = dist
      }
    }
    return maxAdjacentCentroidDistance === 0
      ? 0
      : minEdgeCost / maxAdjacentCentroidDistance
  }

  private _centroidDistance(a: number, b: number): number {
    const dx = this._centroids[a * 2] - this._centroids[b * 2]
    const dy = this._centroids[a * 2 + 1] - this._centroids[b * 2 + 1]
    return Math.sqrt(dx * dx + dy * dy)
  }

  private _heuristic(node: number, goal: number): number {
    return this._centroidDistance(node, goal) * this._heuristicMultiplier
  }

  // ---- binary heap over parallel typed arrays (node id, f-score) ----
  // Comparator: lower score first; ties broken by lower node id (explicit,
  // documented tie-break -- raw heap ordering is otherwise unstable).

  private _heapLess(i: number, j: number): boolean {
    const si = this._heapScore[i]
    const sj = this._heapScore[j]
    if (si !== sj) return si < sj
    return this._heapNode[i] < this._heapNode[j]
  }

  private _heapSwap(i: number, j: number): void {
    const tn = this._heapNode[i]
    this._heapNode[i] = this._heapNode[j]
    this._heapNode[j] = tn
    const ts = this._heapScore[i]
    this._heapScore[i] = this._heapScore[j]
    this._heapScore[j] = ts
  }

  private _heapPush(node: number, score: number): void {
    let i = this._heapSize++
    this._heapNode[i] = node
    this._heapScore[i] = score
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!this._heapLess(i, parent)) break
      this._heapSwap(i, parent)
      i = parent
    }
  }

  private _heapPop(): number {
    const topNode = this._heapNode[0]
    const last = --this._heapSize
    this._heapNode[0] = this._heapNode[last]
    this._heapScore[0] = this._heapScore[last]
    let i = 0
    for (;;) {
      const l = i * 2 + 1
      const r = i * 2 + 2
      let smallest = i
      if (l < this._heapSize && this._heapLess(l, smallest)) smallest = l
      if (r < this._heapSize && this._heapLess(r, smallest)) smallest = r
      if (smallest === i) break
      this._heapSwap(i, smallest)
      i = smallest
    }
    return topNode
  }

  private _reconstructPath(start: number, end: number): Uint16Array {
    let length = 1
    let cur = end
    while (cur !== start) {
      cur = this._cameFrom[cur]
      length++
    }
    const path = new Uint16Array(length)
    path[length - 1] = end
    cur = end
    for (let i = length - 2; i >= 0; i--) {
      cur = this._cameFrom[cur]
      path[i] = cur
    }
    return path
  }

  /**
   * A* search from `start` to `end`, cost-optimal and yielding cooperatively
   * (`yieldIfNeeded`, <= 8 ms slices) during expansion. Resolves with an
   * ordered `Uint16Array` (`path[0] === start`, `path[path.length-1] ===
   * end`). Rejects with `PathNotFoundError` when the open set empties
   * before `end` is reached (graph-disconnected).
   */
  async findPath(start: number, end: number): Promise<Uint16Array> {
    this._gScore.fill(Infinity)
    this._cameFrom.fill(NO_PREDECESSOR)
    this._visited.fill(0)
    this._heapSize = 0

    this._gScore[start] = 0
    this._heapPush(start, this._heuristic(start, end))

    const yieldState = { lastYield: performance.now() }

    while (this._heapSize > 0) {
      const node = this._heapPop()
      if (this._visited[node]) continue
      this._visited[node] = 1

      if (node === end) {
        return this._reconstructPath(start, end)
      }

      const from = this._adjacencyPointers[node]
      const to = this._adjacencyPointers[node + 1]
      const gNode = this._gScore[node]
      for (let k = from; k < to; k++) {
        const neighbor = this._adjacencyNeighbors[k]
        if (this._visited[neighbor]) continue
        const tentativeG = gNode + this._traversalCosts[neighbor]
        if (tentativeG < this._gScore[neighbor]) {
          this._gScore[neighbor] = tentativeG
          this._cameFrom[neighbor] = node
          this._heapPush(neighbor, tentativeG + this._heuristic(neighbor, end))
        }
      }

      await yieldIfNeeded(yieldState)
    }

    throw new PathNotFoundError(start, end)
  }
}
