import { describe, it, expect } from 'vitest'
import { SpatialGraph } from '../src/worker/SpatialGraph'
import { PathNotFoundError } from '../src/errors'

/** Builds CSR adjacencyPointers/adjacencyNeighbors from a plain adjacency list. */
function buildCSR(adjList: number[][]): {
  adjacencyPointers: Uint32Array
  adjacencyNeighbors: Uint16Array
} {
  const pointers = new Uint32Array(adjList.length + 1)
  const neighbors: number[] = []
  for (let i = 0; i < adjList.length; i++) {
    for (const n of adjList[i]) neighbors.push(n)
    pointers[i + 1] = neighbors.length
  }
  return {
    adjacencyPointers: pointers,
    adjacencyNeighbors: Uint16Array.from(neighbors),
  }
}

describe('SpatialGraph — Epic 5 Task 5.2', () => {
  it('finds the shortest path over a line graph, ordered start -> end', async () => {
    // 0 - 1 - 2 - 3
    const { adjacencyPointers, adjacencyNeighbors } = buildCSR([
      [1],
      [0, 2],
      [1, 3],
      [2],
    ])
    const traversalCosts = Uint8Array.from([1, 1, 1, 1])
    const centroids = Int16Array.from([0, 0, 1, 0, 2, 0, 3, 0])
    const graph = new SpatialGraph(
      adjacencyPointers,
      adjacencyNeighbors,
      traversalCosts,
      centroids
    )

    const path = await graph.findPath(0, 3)

    expect(Array.from(path)).toEqual([0, 1, 2, 3])
    expect(path[0]).toBe(0)
    expect(path[path.length - 1]).toBe(3)
  })

  it('picks the cost-optimal route over a diamond graph, not the fewest-hop one', async () => {
    // 0 -> 1 -> 3 (cheap: enter costs 1, 1)
    // 0 -> 2 -> 3 (expensive: enter costs 10, 1)
    // Both routes are 2 hops -- only cost distinguishes them.
    const { adjacencyPointers, adjacencyNeighbors } = buildCSR([
      [1, 2],
      [0, 3],
      [0, 3],
      [1, 2],
    ])
    const traversalCosts = Uint8Array.from([1, 1, 10, 1])
    const centroids = Int16Array.from([0, 0, 1, -1, 1, 1, 2, 0])
    const graph = new SpatialGraph(
      adjacencyPointers,
      adjacencyNeighbors,
      traversalCosts,
      centroids
    )

    const path = await graph.findPath(0, 3)

    expect(Array.from(path)).toEqual([0, 1, 3])
  })

  it('breaks equal-cost ties deterministically by lower node id', async () => {
    // 0 -> 1 -> 3 and 0 -> 2 -> 3 have identical total cost; centroids are
    // coincident so the heuristic is 0 for every node, isolating the
    // heap's tie-break (lower node id wins) as the only deciding factor.
    const { adjacencyPointers, adjacencyNeighbors } = buildCSR([
      [1, 2],
      [0, 3],
      [0, 3],
      [1, 2],
    ])
    const traversalCosts = Uint8Array.from([1, 5, 5, 1])
    const centroids = Int16Array.from([0, 0, 0, 0, 0, 0, 0, 0])
    const graph = new SpatialGraph(
      adjacencyPointers,
      adjacencyNeighbors,
      traversalCosts,
      centroids
    )

    const path = await graph.findPath(0, 3)

    expect(Array.from(path)).toEqual([0, 1, 3])
  })

  it('rejects with PathNotFoundError for disconnected components', async () => {
    // 0 - 1   2 - 3  (no edges between the two components)
    const { adjacencyPointers, adjacencyNeighbors } = buildCSR([
      [1],
      [0],
      [3],
      [2],
    ])
    const traversalCosts = Uint8Array.from([1, 1, 1, 1])
    const centroids = Int16Array.from([0, 0, 1, 0, 2, 0, 3, 0])
    const graph = new SpatialGraph(
      adjacencyPointers,
      adjacencyNeighbors,
      traversalCosts,
      centroids
    )

    await expect(graph.findPath(0, 3)).rejects.toBeInstanceOf(PathNotFoundError)
  })

  it('resolves trivially when start === end', async () => {
    const { adjacencyPointers, adjacencyNeighbors } = buildCSR([[1], [0]])
    const traversalCosts = Uint8Array.from([1, 1])
    const centroids = Int16Array.from([0, 0, 1, 0])
    const graph = new SpatialGraph(
      adjacencyPointers,
      adjacencyNeighbors,
      traversalCosts,
      centroids
    )

    const path = await graph.findPath(0, 0)

    expect(Array.from(path)).toEqual([0])
  })
})
