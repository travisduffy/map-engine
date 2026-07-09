import * as THREE from 'three'
import { SectorBitmapParser } from './SectorBitmapParser'
import { SectorRegistry } from './SectorRegistry'
import { MapRenderer } from './MapRenderer'
import type {
  MapConfig,
  PickEvent,
  SectorData,
  PickResult,
  FrameCallback,
  BootstrapPayload,
  BootstrapAckPayload,
  WorkerMessage,
  MapModeId,
} from './types'
import {
  MapInvalidatedError,
  ModeNotReadyError,
  CostsRequiredError,
} from './errors'
import { RenderClock } from './RenderClock'
import { SharedRegistryProxy } from './worker/SharedRegistryProxy'
import { TransferableGroupPool } from './worker/transferablePool'

export class MapEngine {
  private _loaded: boolean = false
  private _destroyed: boolean = false
  private _loading: boolean = false
  private _lastHexKey: string | null = null
  private _parser: SectorBitmapParser
  private _handlers: Map<string, Set<Function>>
  private _canvas: HTMLCanvasElement | null = null
  private _registry: SectorRegistry | null = null
  private _renderer: MapRenderer | null = null
  private readonly _raycaster: THREE.Raycaster
  private _frameCallbacks: FrameCallback[] = []
  private readonly _renderClock: RenderClock
  private _tickRate: number = 60
  private _worker: Worker
  private _proxy: SharedRegistryProxy | null = null
  private _registryInvalidated: boolean = false
  private _lastBootstrapAck: BootstrapAckPayload | null = null
  private _mapModes: Map<MapModeId, Uint32Array> = new Map()
  private _currentMapMode: MapModeId | null = null
  private _costsReady: boolean = false
  private _pool: TransferableGroupPool | null = null

  constructor() {
    this._parser = new SectorBitmapParser()
    this._handlers = new Map<string, Set<Function>>()
    this._raycaster = new THREE.Raycaster()
    this._renderClock = new RenderClock()
    this._worker = this._createWorker()
  }

  private _createWorker(): Worker {
    return new Worker(new URL('./worker/index.ts', import.meta.url), {
      type: 'module',
    })
  }

  on(event: 'sectorClick', handler: (result: PickResult) => void): void
  on(event: 'sectorHover', handler: (result: PickResult | null) => void): void
  on(_event: string, _handler: Function): void {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    const event = _event
    const handler = _handler
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set())
    }
    this._handlers.get(event)!.add(handler)
  }

  off(_event: 'sectorClick' | 'sectorHover', _handler: Function): void {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    const set = this._handlers.get(_event)
    if (set) set.delete(_handler)
  }

  onFrame(callback: FrameCallback): void {
    if (this._destroyed) return
    this._frameCallbacks.push(callback)
  }

  offFrame(callback: FrameCallback): void {
    if (this._destroyed) return
    const idx = this._frameCallbacks.indexOf(callback)
    if (idx !== -1) this._frameCallbacks.splice(idx, 1)
  }

  private _emit(event: string, payload: unknown): void {
    const set = this._handlers.get(event)
    if (set) {
      for (const handler of set) {
        handler(payload)
      }
    }
  }

  /**
   * NDC conversion → raycast → UV → clamped, Y-inverted bitmap pixel coords.
   * Shared by the hover/click pipeline and `pick()` (Epic 3 Task 3.4).
   * Returns null on a mesh-miss (ray did not hit the map plane).
   */
  private _resolvePixelCoords(
    event: PickEvent
  ): { pixelX: number; pixelY: number } | null {
    if (!this._renderer || !this._registry || !this._canvas) return null

    const rect = this._canvas.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )

    this._raycaster.setFromCamera(ndc, this._renderer.camera)
    const intersections = this._raycaster.intersectObject(this._renderer.mesh)
    if (intersections.length === 0) return null

    const uv = intersections[0].uv!
    const width = this._registry.width
    const height = this._registry.height
    const pixelX = Math.max(0, Math.min(width - 1, Math.floor(uv.x * width)))
    const pixelY = Math.max(
      0,
      Math.min(height - 1, Math.floor((1 - uv.y) * height))
    )
    return { pixelX, pixelY }
  }

  /** Resolves a bitmap pixel + numeric ID into a `PickResult`, or null on a void/unknown sector. */
  private _resolveHexPick(pixelX: number, pixelY: number): PickResult | null {
    const numId = this._renderer!.readSectorIdAt(pixelX, pixelY)
    if (numId >= this._registry!.idToHex.length) return null
    const hexKey = this._registry!.idToHex[numId]
    const sectorData = this._registry!.getSector(hexKey)
    if (sectorData === undefined) return null
    return { hexKey, sectorData, pixelX, pixelY }
  }

  private _handlePointerEvent(event: PickEvent, isClick: boolean): void {
    if (!this._renderer || !this._registry || !this._canvas) return

    const coords = this._resolvePixelCoords(event)
    const result = coords
      ? this._resolveHexPick(coords.pixelX, coords.pixelY)
      : null

    if (result === null) {
      if (!isClick && this._lastHexKey !== null) {
        this._lastHexKey = null
        this._emit('sectorHover', null)
      }
      return
    }

    if (!isClick) {
      // Suppress hover during middle-button pan OR left-button drag.
      if (this._renderer.isPanning || this._renderer.isLeftDragging) return
      if (result.hexKey !== this._lastHexKey) {
        this._lastHexKey = result.hexKey
        this._emit('sectorHover', result)
      }
    } else {
      // Suppress synthesized click that follows a left-button drag.
      if (this._renderer.leftHasDragged) return
      this._emit('sectorClick', result)
    }
  }

  /**
   * Resolves the sector under `point` (async — the sole sanctioned public
   * API signature break, ROADMAP §12.4). Resolves `null` before a successful
   * `loadMap()`/`BOOTSTRAP_ACK`, on a mesh-miss, or on a void/unknown pixel.
   */
  async pick(point: PickEvent): Promise<PickResult | null> {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded) return null
    const coords = this._resolvePixelCoords(point)
    if (!coords) return null
    return this._resolveHexPick(coords.pixelX, coords.pixelY)
  }

  /**
   * Sets the simulation tick rate (1–240 Hz, default 60) to be handed to the
   * Worker at bootstrap. Must be called before `loadMap()` resolves.
   */
  setTickRate(hz: number): void {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (this._loaded)
      throw new Error(
        'MapEngine: setTickRate() cannot be called after loadMap() has resolved'
      )
    if (Number.isNaN(hz) || hz < 1 || hz > 240) {
      throw new RangeError(
        `MapEngine: setTickRate(hz) requires 1 <= hz <= 240 (received ${hz})`
      )
    }
    this._tickRate = hz
  }

  /** @internal read by the Task 1.5 BOOTSTRAP payload builder. */
  get tickRate(): number {
    return this._tickRate
  }

  async loadMap(config: MapConfig): Promise<void> {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (this._loading)
      throw new Error('MapEngine: loadMap() is already in progress')

    if (this._loaded) {
      // Reload lifecycle (Epic 3 Task 3.3): invalidate the previous
      // session's in-flight proxy calls before re-bootstrapping.
      this._proxy?.rejectAll(new MapInvalidatedError())
      this._proxy = null
      this._pool?.dispose()
      this._pool = null
      this._renderer?.destroy()
      this._worker.terminate()
      this._worker = this._createWorker()
      this._renderClock.reset()
      this._registry = null
      this._renderer = null
      this._canvas = null
      this._registryInvalidated = false
      this._lastHexKey = null
      this._loaded = false
      // CA-7: discard the registered palette data (Epic 4 Task 4.3).
      this._mapModes.clear()
      this._currentMapMode = null
      // CA-4: a fresh Worker means a fresh (empty) SpatialGraph -- costs
      // must be re-supplied before findPath() is usable again.
      this._costsReady = false
    }

    this._loading = true

    try {
      const [{ buffer, width, height }, definition] = await Promise.all([
        this._parser.parse(config.bitmapUrl),
        fetch(config.definitionUrl).then(r => {
          if (!r.ok)
            throw new Error(
              `Failed to load definition: HTTP ${r.status} ${r.statusText}`
            )
          return r.json()
        }),
      ])

      const registry = new SectorRegistry(buffer, width, height, definition)
      let renderer: MapRenderer
      const hook = (): void => {
        this._renderClock.tick(this._frameCallbacks)
      }
      renderer = new MapRenderer(
        config.canvas,
        registry,
        hook,
        e => this._handlePointerEvent(e, false),
        e => this._handlePointerEvent(e, true)
      )
      // Suspend rendering across the Worker bootstrap round-trip — a real
      // rAF tick here would consume the render loop's "priming" frame before
      // loadMap() has even resolved.
      renderer._pauseLoop()

      // Pre-transfer snapshots (independent buffers — survive the detach below).
      const registrySnapshot = {
        bboxes: registry.bboxes.slice(),
        centroids: registry.centroids.slice(),
        adjacencyPointers: registry.adjacencyPointers.slice(),
        adjacencyNeighbors: registry.adjacencyNeighbors.slice(),
      }

      const sectorCount = registry.idToHex.length

      const bootstrapPayload: BootstrapPayload = {
        pixelIndices: registry.pixelIndices,
        bboxes: registry.bboxes,
        centroids: registry.centroids,
        adjacencyPointers: registry.adjacencyPointers,
        adjacencyNeighbors: registry.adjacencyNeighbors,
        contourPointers: registry.contourPointers,
        contourPoints: registry.contourPoints,
        borderEdges: registry.borderEdges,
        borderEdgeCount: registry.borderEdgeCount,
        width: registry.width,
        height: registry.height,
        sectorCount,
        tickHz: this._tickRate,
      }

      const ackPromise = new Promise<BootstrapAckPayload>(resolve => {
        const onMessage = (e: MessageEvent<WorkerMessage>): void => {
          if (e.data.type === 'BOOTSTRAP_ACK') {
            this._worker.removeEventListener('message', onMessage)
            resolve(e.data.payload)
          }
        }
        this._worker.addEventListener('message', onMessage)
      })

      this._worker.postMessage(
        {
          type: 'BOOTSTRAP',
          payload: bootstrapPayload,
        } satisfies WorkerMessage,
        [
          bootstrapPayload.pixelIndices.buffer,
          bootstrapPayload.bboxes.buffer,
          bootstrapPayload.centroids.buffer,
          bootstrapPayload.adjacencyPointers.buffer,
          bootstrapPayload.adjacencyNeighbors.buffer,
          bootstrapPayload.contourPointers.buffer,
          bootstrapPayload.contourPoints.buffer,
          bootstrapPayload.borderEdges.buffer,
          bootstrapPayload.borderEdgeCount.buffer,
        ]
      )
      this._registryInvalidated = true

      this._lastBootstrapAck = await ackPromise
      this._proxy = new SharedRegistryProxy(this._worker, registrySnapshot)
      this._pool = new TransferableGroupPool(this._worker, () => {
        renderer._dirty = true
      })
      renderer._postRenderHook = this._pool.flushBounces
      renderer._resumeLoop()

      this._canvas = config.canvas
      this._registry = registry
      this._renderer = renderer

      this._loaded = true
      this._loading = false
    } catch (err) {
      this._loading = false
      throw err
    }
  }

  /**
   * Rejects all in-flight proxy calls with `MapInvalidatedError`, tears down
   * the renderer/Worker, and resolves. `destroy()` is the existing sync
   * teardown entry point and delegates here fire-and-forget (ROADMAP §8 B3.c).
   */
  async dispose(): Promise<void> {
    // Step 1: idempotent — never throws
    if (this._destroyed) return

    // Step 0 (new): reject in-flight proxy calls before tearing anything down
    this._proxy?.rejectAll(new MapInvalidatedError())
    this._proxy = null
    this._pool?.dispose()
    this._pool = null
    // CA-7: discard the registered palette data (Epic 4 Task 4.3).
    this._mapModes.clear()
    this._currentMapMode = null

    // Step 0b: clear frame callbacks
    this._frameCallbacks = []
    // Step 2: destroy renderer (disposes rAF, geometry, material, texture, MapRenderer listeners)
    if (this._renderer) {
      this._renderer.destroy()
    }

    // Step 3: clear event handler map
    this._handlers.clear()

    // Step 5: null out refs
    this._registry = null
    this._renderer = null
    this._canvas = null
    this._loading = false

    // Steps 6–7: conditionally mark destroyed
    if (this._loaded) {
      this._worker.terminate()
      this._destroyed = true
    }
    // If _loaded === false (partial failure), do NOT set _destroyed or terminate
    // the Worker (never bootstrapped yet) — allow retry via loadMap()
  }

  destroy(): void {
    void this.dispose()
  }

  /** @internal read by integration tests to verify the BOOTSTRAP round trip. */
  get lastBootstrapAck(): BootstrapAckPayload | null {
    return this._lastBootstrapAck
  }

  get renderer(): MapRenderer {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._renderer!
  }

  /**
   * @deprecated Throws `MapInvalidatedError` once the bootstrap transfer has
   * detached this registry's buffers. Use `getSector`/`getSectorKeys`/
   * `getBBox`/`getCentroid`/`getNeighbors` instead.
   */
  get registry(): SectorRegistry {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    if (this._registryInvalidated) throw new MapInvalidatedError()
    return this._registry!
  }

  getSector(hexKey: string): SectorData | undefined {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._registry!.getSector(hexKey)
  }

  getSectorKeys(): string[] {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._registry!.getSectorKeys()
  }

  setSectorColor(hexKey: string, color: string): void {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    this._renderer!.setSectorColor(hexKey, color)
  }

  resetSectorColor(hexKey: string): void {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    this._renderer!.resetSectorColor(hexKey)
  }

  /**
   * Registers a named full-map palette (CA-7). `colors` is a packed-RGB
   * `Uint32Array` with one entry per sector, indexed by numeric sector ID.
   * Synchronous: throws on a duplicate `id`, a length mismatch, or before
   * `loadMap()` has resolved.
   */
  registerMapMode(id: MapModeId, colors: Uint32Array): void {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded) throw new ModeNotReadyError('registerMapMode')
    if (this._mapModes.has(id)) {
      throw new Error(`MapEngine: map mode '${id}' is already registered`)
    }
    const sectorCount = this._registry!.idToHex.length
    if (colors.length !== sectorCount) {
      throw new Error(
        `MapEngine: registerMapMode colors.length (${colors.length}) !== sectorCount (${sectorCount})`
      )
    }
    this._mapModes.set(id, colors)
  }

  /**
   * Activates a registered map mode (CA-7). Synchronous: throws on an
   * unknown `id` or before `loadMap()` has resolved; re-activating the
   * already-current mode is a no-op (zero uniform writes, zero submits).
   */
  setMapMode(id: MapModeId): void {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded) throw new ModeNotReadyError('setMapMode')
    const colors = this._mapModes.get(id)
    if (!colors) throw new Error(`Unknown map mode: ${id}`)
    if (this._currentMapMode === id) return
    this._currentMapMode = id
    this._renderer!.setPalette(colors)
  }

  getNeighbors(id: string): string[] | undefined
  getNeighbors(id: number): number[]
  getNeighbors(id: string | number): string[] | number[] | undefined {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    if (typeof id === 'number') {
      return this._proxy!.getNeighborIdsByNumericId(id)
    }
    // undefined if hexKey is not in the definition (bitmap-only or unknown)
    const numId = this._registry!.getNumericId(id)
    if (numId === undefined || this._registry!.getSector(id) === undefined)
      return undefined
    return this._proxy!.getNeighborIdsByNumericId(numId).map(
      nid => this._registry!.idToHex[nid]
    )
  }

  getBBox(id: string): [number, number, number, number]
  getBBox(id: number): [number, number, number, number]
  getBBox(id: string | number): [number, number, number, number] {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    const numId = typeof id === 'number' ? id : this._registry!.getNumericId(id)
    if (numId === undefined)
      throw new Error(`MapEngine: unknown sector '${id}'`)
    return this._proxy!.getBBoxByNumericId(numId)
  }

  getCentroid(id: string): [number, number]
  getCentroid(id: number): [number, number]
  getCentroid(id: string | number): [number, number] {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    const numId = typeof id === 'number' ? id : this._registry!.getNumericId(id)
    if (numId === undefined)
      throw new Error(`MapEngine: unknown sector '${id}'`)
    return this._proxy!.getCentroidByNumericId(numId)
  }

  /**
   * Uploads per-sector traversal costs for `findPath` (CA-4). Transfers
   * ownership of `costs.buffer` itself (the caller's actual `ArrayBuffer`,
   * never a copy) to the Worker — `costs.byteLength === 0` on Main once
   * this resolves. Replacing costs requires a fresh `Uint8Array`
   * allocation; a sub-view (non-zero `byteOffset`, or a `byteLength`
   * shorter than the backing buffer) is rejected up front so an unrelated
   * slice of the consumer's memory is never detached.
   */
  async setTraversalCosts(costs: Uint8Array): Promise<void> {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    if (
      costs.byteOffset !== 0 ||
      costs.byteLength !== costs.buffer.byteLength
    ) {
      throw new Error(
        'MapEngine.setTraversalCosts: costs must be a Uint8Array over the whole of its own ArrayBuffer (byteOffset 0, byteLength === buffer.byteLength) — pass a fresh allocation, not a sub-view.'
      )
    }
    await this._proxy!.call<void>('setTraversalCosts', costs, [costs.buffer])
    this._costsReady = true
  }

  /**
   * Resolves the cost-optimal path between two sectors by numeric id
   * (CA-4), computed via A* over the CSR adjacency graph in the Worker.
   * Rejects with `CostsRequiredError` if `setTraversalCosts` has never
   * resolved, or `PathNotFoundError` if the sectors are not connected by
   * traversable edges.
   */
  async findPath(startId: number, endId: number): Promise<Uint16Array> {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    if (!this._costsReady) throw new CostsRequiredError()
    return this._proxy!.call<Uint16Array>('findPath', { startId, endId })
  }

  /**
   * Uploads a consumer-defined sector→group mapping (CA-5). `mapping` is
   * indexed by numeric sector id; each entry is either `0xFFFF` (excluded
   * from every group) or a group id in `[0, maxGroups)`. Transfers ownership
   * of `mapping.buffer` itself (never a copy) to the Worker —
   * `mapping.byteLength === 0` on Main once this resolves. A change to
   * `maxGroups` reallocates the group-bbox ring pool.
   */
  async setParentMapping(
    mapping: Uint16Array,
    maxGroups: number
  ): Promise<void> {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    if (
      mapping.byteOffset !== 0 ||
      mapping.byteLength !== mapping.buffer.byteLength
    ) {
      throw new Error(
        'MapEngine.setParentMapping: mapping must be a Uint16Array over the whole of its own ArrayBuffer (byteOffset 0, byteLength === buffer.byteLength) — pass a fresh allocation, not a sub-view.'
      )
    }
    await this._proxy!.call<void>('setParentMapping', { mapping, maxGroups }, [
      mapping.buffer,
    ])
  }

  /**
   * Folds each group's member-sector bounding boxes into a single aggregate
   * bbox per group (CA-5), computed in the Worker and delivered to Main via
   * the Transferable ring pool. Rejects with `MappingRequiredError` if
   * `setParentMapping` has never resolved.
   */
  async aggregateGroups(): Promise<void> {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    await this._proxy!.call<void>('aggregateGroups')
  }

  /**
   * Synchronous read of a group's aggregate bounding box (CA-5), served from
   * the ring pool's Main-current snapshot. Throws `MappingRequiredError` if
   * `aggregateGroups()` has never resolved, or `RangeError` if `groupId` is
   * out of range.
   */
  getGroupBBox(groupId: number): [number, number, number, number] {
    if (this._destroyed) throw new Error('MapEngine: destroyed')
    if (!this._loaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._pool!.getGroupBBox(groupId)
  }
}
