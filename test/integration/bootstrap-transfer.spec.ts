import { describe, it, expect, afterEach } from 'vitest'
import { MapEngine } from '../../src/MapEngine'
import { SectorBitmapParser } from '../../src/SectorBitmapParser'
import { SectorRegistry } from '../../src/SectorRegistry'
import { makeCanvas } from '../testUtils'

const BITMAP_URL = '/test/fixtures/test-4x4.png'
const DEFINITION_URL = '/test/fixtures/test-4x4.json'

describe('MapEngine — BOOTSTRAP transfer (Epic 1 Task 1.5, F-3.1)', () => {
  let engine: MapEngine
  let canvas: HTMLCanvasElement

  afterEach(() => {
    engine?.destroy()
    canvas?.remove()
  })

  it('detaches all 9 bootstrap buffers (byteLength === 0) post-transfer', async () => {
    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    // The public `registry` getter throws MapInvalidatedError by design once
    // buffers are transferred (ROADMAP §8 B3.c) — bracket access to the
    // internal field is this codebase's established pattern for reaching
    // past that guard in tests (see test/testUtils.ts advanceFrame()).
    const registry = engine['_registry'] as SectorRegistry
    const transferred: ArrayBufferView[] = [
      registry.pixelIndices,
      registry.bboxes,
      registry.centroids,
      registry.adjacencyPointers,
      registry.adjacencyNeighbors,
      registry.contourPointers,
      registry.contourPoints,
      registry.borderEdges,
      registry.borderEdgeCount,
    ]
    expect(transferred).toHaveLength(9)
    for (const buf of transferred) {
      expect(buf.byteLength).toBe(0)
    }
  })

  it('BOOTSTRAP_ACK matches independently-computed pre-transfer scalars', async () => {
    // Independent ground-truth parse — never transferred, so its buffers
    // (and the scalars derived from them) stay live for comparison.
    const parser = new SectorBitmapParser()
    const { buffer, width, height } = await parser.parse(BITMAP_URL)
    const definition = await fetch(DEFINITION_URL).then(r => r.json())
    const groundTruth = new SectorRegistry(buffer, width, height, definition)

    const sectorCount = groundTruth.idToHex.length
    const zeroBBox: [number, number, number, number] = [0, 0, 0, 0]
    const expectedAck = {
      sectorCount,
      totalEdges: groundTruth.adjacencyNeighbors.length,
      firstSectorBBox: sectorCount > 0 ? groundTruth.getBBox(0) : zeroBBox,
      lastSectorBBox:
        sectorCount > 0 ? groundTruth.getBBox(sectorCount - 1) : zeroBBox,
    }

    canvas = makeCanvas()
    engine = new MapEngine()
    await engine.loadMap({
      bitmapUrl: BITMAP_URL,
      definitionUrl: DEFINITION_URL,
      canvas,
    })

    expect(engine.lastBootstrapAck).toEqual(expectedAck)
  })
})
