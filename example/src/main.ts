/**
 * map-engine canonical example
 *
 * Demonstrates every public API surface:
 *   MapEngine, MapRenderer, SectorRegistry, SectorBitmapParser, toHexKey
 *   Events: sectorHover, sectorClick
 *   Methods: loadMap, setTickRate, setSectorColor, resetSectorColor, getSector, getSectorKeys,
 *            getBBox, getCentroid, getNeighbors, registerMapMode, setMapMode, on, off, destroy,
 *            setTraversalCosts, findPath, setParentMapping, aggregateGroups, getGroupBBox
 */

import { AppController } from './controller'

/*
 * Direct SectorBitmapParser + SectorRegistry usage (advanced / Worker pattern):
 *
 *   import { SectorBitmapParser, SectorRegistry } from 'map-engine'
 *
 *   const parser = new SectorBitmapParser()
 *   const { buffer, width, height } = await parser.parse('/map.png')
 *
 *   const response = await fetch('/sectors.json')
 *   const definition = await response.json()
 *
 *   const registry = new SectorRegistry(buffer, width, height, definition)
 *   // registry.getBBox(), registry.getCentroid(), registry.getSectorPixels() are now available
 *   // Both SectorBitmapParser and SectorRegistry are DOM-free and Worker-safe.
 */

const canvas = document.getElementById('map') as HTMLCanvasElement
const chkHover = document.getElementById('chk-hover') as HTMLInputElement

const app = new AppController(canvas, chkHover)
await app.start()
