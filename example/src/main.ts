/**
 * map-engine canonical example — entry point (App in app.ts is the composition root).
 *
 * Demonstrates every public API surface across example/src/features/*:
 *   MapEngine (default), toHexKey, PathNotFoundError, types PickResult/SectorData
 *   Events: sectorHover, sectorClick
 *   Lifecycle: loadMap, setTickRate, onFrame/offFrame, destroy
 *   Data: getSector, getSectorKeys, getBBox, getCentroid, getNeighbors
 *   Color: setSectorColor, resetSectorColor
 *   Modes: registerMapMode, setMapMode
 *   Async: pick, setTraversalCosts, findPath, setParentMapping, aggregateGroups,
 *          computeAnchors, recomputeBorders
 *   Reads: getGroupBBox, getAnchor, getBorderSegments, project
 *   Borders: setBordersVisible
 *
 * Advanced / Worker pattern (SectorBitmapParser + SectorRegistry direct usage):
 *   import { SectorBitmapParser, SectorRegistry } from 'map-engine'
 *   const parser = new SectorBitmapParser()
 *   const { buffer, width, height } = await parser.parse('/map.png')
 *   const definition = await (await fetch('/sectors.json')).json()
 *   const registry = new SectorRegistry(buffer, width, height, definition)
 *   // Both are DOM-free and Worker-safe.
 */

import { App } from './app'

const canvas = document.getElementById('map') as HTMLCanvasElement
const app = new App(canvas)
await app.start()
