import MapEngine from 'map-engine'
import { HighlightLayers } from './lib/highlights'
import { setStatus } from './lib/dom'
import type { AppContext, Feature, FeatureFactory } from './lib/feature'
import { createSectorList } from './features/sector-list'
import { createHover } from './features/hover'
import { createSelection } from './features/selection'
import { createFrameHook } from './features/frame-hook'
import { createClock } from './features/clock'
import { createPathfinding } from './features/pathfinding'
import { createRegions } from './features/regions'
import { createBorders } from './features/borders'
import { createAnchors } from './features/anchors'
import { createMapModes } from './features/map-modes'

/**
 * Feature registry, in mount order. Order matters in one place: `createRegions`
 * uploads the province parentMapping via setParentMapping(); `createBorders`
 * reuses that mapping in recomputeBorders(), so Regions must mount first.
 */
const FEATURES: FeatureFactory[] = [
  createSectorList,
  createHover,
  createSelection,
  createFrameHook,
  createClock,
  createPathfinding,
  createRegions,
  createBorders,
  createAnchors,
  createMapModes,
]

/** Composition root: owns the engine lifecycle and the feature set. */
export class App {
  private engine: MapEngine | null = null
  private features: Feature[] = []
  // Guards re-entrant Reload clicks while a start/reload is already in flight.
  private isBusy = false
  private readonly canvas: HTMLCanvasElement
  private readonly reloadBtn: HTMLButtonElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.reloadBtn = document.getElementById('btn-reload') as HTMLButtonElement
    this.reloadBtn.addEventListener('click', () => void this.reload())
  }

  /** Boots the engine, loads the map, and mounts every feature. */
  async start(): Promise<void> {
    if (this.isBusy) return
    this.isBusy = true
    try {
      await this.startInner()
    } finally {
      this.isBusy = false
    }
  }

  /** start() body, split out so the busy guard wraps every exit path. */
  private async startInner(): Promise<void> {
    const engine = new MapEngine()
    this.engine = engine
    engine.setTickRate(60) // must precede loadMap resolving
    setStatus('Loading map… (this may take a moment)')

    try {
      await engine.loadMap({
        bitmapUrl: 'map.png', // relative — resolves under subpath deploys
        definitionUrl: 'sectors.json',
        canvas: this.canvas,
      })
    } catch (err) {
      setStatus(
        `Failed to load map: ${err instanceof Error ? err.message : String(err)}`
      )
      engine.destroy()
      this.engine = null
      return
    }

    const sectorKeys = engine.getSectorKeys()
    const hexToId = new Map<string, number>()
    sectorKeys.forEach((key, id) => hexToId.set(key, id))

    const ctx: AppContext = {
      engine,
      highlights: new HighlightLayers(engine),
      sectorKeys,
      hexToId,
      canvas: this.canvas,
    }

    this.features = FEATURES.map(create => create(ctx))
    for (const feature of this.features) await feature.mount()

    setStatus('Ready — scroll to zoom, middle-mouse drag to pan')
  }

  /** Tears down every feature and the engine, then reboots. */
  async reload(): Promise<void> {
    if (this.isBusy) return // ignore Reload while a load is in flight
    for (const feature of this.features) feature.destroy() // before engine.destroy()
    this.features = []
    this.engine?.destroy()
    this.engine = null
    await this.start()
  }
}
