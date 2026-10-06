import { SectorBitmapParser } from '../sector/SectorBitmapParser.js'
import { SectorRegistry } from '../sector/SectorRegistry.js'
import {
  MapInvalidatedError,
  ModeNotReadyError,
  CostsRequiredError,
  WorkerStartError,
} from '../shared/errors.js'
import { SharedRegistryProxy } from '../worker/SharedRegistryProxy.js'
import {
  TransferableGroupPool,
  TransferableAnchorPool,
  TransferableBorderPool,
} from '../worker/transferable-pool.js'
import { BorderCoalescer } from './BorderCoalescer.js'
import { EventEmitter } from './EventEmitter.js'
import { MapRenderer } from './MapRenderer.js'
import { PointerPickResolver } from './PointerPickResolver.js'
import { RenderClock } from './RenderClock.js'
import type {
  BBox,
  FitBoundsOptions,
  MapConfig,
  MapView,
  PickEvent,
  SectorData,
  PickResult,
  FrameCallback,
  BootstrapPayload,
  BootstrapAckPayload,
  WorkerMessage,
  MapModeId,
} from '../shared/types.js'

type PendingCamera =
  | { kind: 'view'; view: Partial<MapView> }
  | { kind: 'fit'; bbox: BBox; options: FitBoundsOptions }

const CANCELLED_LOAD_MESSAGE =
  'MapEngine: loadMap() was cancelled by dispose().'

const assertFinite = (method: string, field: string, value: number) => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`MapEngine.${method}: ${field} must be finite`)
  }
}

const normalizeIgnoredColors = (colors: readonly string[] = []) => {
  const ignored = new Set<string>()
  for (const color of colors) {
    const hex = color.toLowerCase()
    if (!/^[0-9a-f]{6}$/.test(hex)) {
      throw new RangeError(
        'MapEngine.loadMap: ignoredColors must be six hex digits'
      )
    }
    ignored.add(hex)
  }
  return ignored
}

export class MapEngine {
  private _isLoaded: boolean = false
  private _isDestroyed: boolean = false
  private _isLoading: boolean = false
  private _pendingCamera: PendingCamera | null = null
  private _parser: SectorBitmapParser
  private readonly _events: EventEmitter
  private _registry: SectorRegistry | null = null
  private _renderer: MapRenderer | null = null
  private _picker: PointerPickResolver | null = null
  private _frameCallbacks: FrameCallback[] = []
  private readonly _renderClock: RenderClock
  private _tickRate: number = 60
  private _worker: Worker | null
  private _loadGeneration = 0
  private _workerFailure: WorkerStartError | null = null
  private _rejectAck: ((err: Error) => void) | null = null
  private _proxy: SharedRegistryProxy | null = null
  private _isRegistryInvalidated: boolean = false
  private _lastBootstrapAck: BootstrapAckPayload | null = null
  private _mapModes: Map<MapModeId, Uint32Array> = new Map()
  private _currentMapMode: MapModeId | null = null
  private _areCostsReady: boolean = false
  private _pool: TransferableGroupPool | null = null
  private _anchorPool: TransferableAnchorPool | null = null
  private _borderPool: TransferableBorderPool | null = null
  private readonly _borderCoalescer: BorderCoalescer

  /** Constructs the facade and spins up the Worker eagerly (before any `loadMap()`), so the bootstrap round-trip can begin the moment a map is loaded. */
  constructor() {
    this._parser = new SectorBitmapParser()
    this._events = new EventEmitter()
    this._renderClock = new RenderClock()
    this._worker = this._spawnWorker()
    this._borderCoalescer = new BorderCoalescer(
      () => this._proxy!.call<void>('recomputeBorders'),
      () => !this._isDestroyed && this._isLoaded && !!this._proxy
    )
  }

  /** Registers `handler` for a pick event (`sectorClick`/`sectorHover`). Throws once destroyed. */
  on(event: 'sectorClick', handler: (result: PickResult) => void): void
  on(event: 'sectorHover', handler: (result: PickResult | null) => void): void
  on(event: 'viewChange', handler: (view: MapView) => void): void
  on(event: string, handler: Function): void {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    this._events.on(event, handler)
  }

  /** Removes a previously registered pick-event handler; a no-op if it was never registered. Throws once destroyed. */
  off(
    event: 'sectorClick' | 'sectorHover' | 'viewChange',
    handler: Function
  ): void {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    this._events.off(event, handler)
  }

  /** Registers a per-frame callback invoked with the frame delta on every render tick; a no-op once destroyed. */
  onFrame(callback: FrameCallback): void {
    if (this._isDestroyed) return
    this._frameCallbacks.push(callback)
  }

  /** Unregisters a frame callback; a no-op once destroyed or if it was never registered. */
  offFrame(callback: FrameCallback): void {
    if (this._isDestroyed) return
    const idx = this._frameCallbacks.indexOf(callback)
    if (idx !== -1) this._frameCallbacks.splice(idx, 1)
  }

  /**
   * Resolves the sector under `point` (async — the sole sanctioned public
   * API signature break, ROADMAP §12.4). Resolves `null` before a successful
   * `loadMap()`/`BOOTSTRAP_ACK`, on a mesh-miss, or on a void/unknown pixel.
   */
  async pick(point: PickEvent): Promise<PickResult | null> {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded) return null
    return this._picker!.pick(point)
  }

  /**
   * Sets the simulation tick rate (1–240 Hz, default 60) to be handed to the
   * Worker at bootstrap. Must be called before `loadMap()` resolves.
   */
  setTickRate(hz: number): void {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (this._isLoaded)
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

  /** @internal read by the BOOTSTRAP payload builder. */
  get tickRate(): number {
    return this._tickRate
  }

  /**
   * Loads a map: parses the bitmap + definition, builds the `SectorRegistry`,
   * uploads the index texture, and bootstraps the Worker (transferring every
   * spatial buffer). Resolves once the Worker acknowledges the bootstrap.
   * Calling it again after a successful load reloads — the previous session
   * (Worker, renderer, proxy, pools, palette, costs) is torn down and rebuilt.
   * Throws if destroyed or if a load is already in progress.
   */
  async loadMap(config: MapConfig): Promise<void> {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (this._isLoading)
      throw new Error('MapEngine: loadMap() is already in progress')

    // Checked before the teardown, so a bad entry leaves a loaded map alone.
    const ignored = normalizeIgnoredColors(config.ignoredColors)

    if (this._isLoaded) {
      // Reload lifecycle: invalidate the previous session's in-flight
      // proxy calls before re-bootstrapping.
      this._proxy?.rejectAll(new MapInvalidatedError())
      this._proxy = null
      this._pool?.dispose()
      this._pool = null
      this._anchorPool?.dispose()
      this._anchorPool = null
      this._borderPool?.dispose()
      this._borderPool = null
      this._borderCoalescer.reset()
      this._renderer?.destroy()
      this._worker?.terminate()
      this._worker = null
      this._renderClock.reset()
      this._registry = null
      this._renderer = null
      this._picker = null
      this._isRegistryInvalidated = false
      this._isLoaded = false
      // CA-7: discard the registered palette data (Epic 4 Task 4.3).
      this._mapModes.clear()
      this._currentMapMode = null
      // CA-4: a fresh Worker means a fresh (empty) SpatialGraph -- costs
      // must be re-supplied before findPath() is usable again.
      this._areCostsReady = false
    }

    this._isLoading = true
    const generation = this._loadGeneration
    // A dispose before this load stopped the worker, so start a new one.
    const worker = (this._worker ??= this._spawnWorker())
    let partialRenderer: MapRenderer | null = null

    try {
      if (this._workerFailure) {
        throw this._workerFailure
      }
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
      this._throwIfCancelled(generation)

      const registry = new SectorRegistry(
        buffer,
        width,
        height,
        definition,
        ignored
      )
      let renderer: MapRenderer
      const hook = (): void => {
        this._renderClock.tick(this._frameCallbacks)
      }
      renderer = new MapRenderer(
        config.canvas,
        registry,
        hook,
        e => this._picker?.handlePointer(e, false),
        e => this._picker?.handlePointer(e, true)
      )
      partialRenderer = renderer
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

      const ackPromise = new Promise<BootstrapAckPayload>((resolve, reject) => {
        this._rejectAck = reject
        const onMessage = (e: MessageEvent<WorkerMessage>): void => {
          if (e.data.type === 'BOOTSTRAP_ACK') {
            worker.removeEventListener('message', onMessage)
            this._rejectAck = null
            resolve(e.data.payload)
          }
        }
        worker.addEventListener('message', onMessage)
      })

      if (this._workerFailure) {
        throw this._workerFailure
      }
      worker.postMessage(
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
      this._isRegistryInvalidated = true

      const ack = await ackPromise
      this._throwIfCancelled(generation)
      this._lastBootstrapAck = ack
      this._rejectAck = null
      this._proxy = new SharedRegistryProxy(worker, registrySnapshot)
      this._pool = new TransferableGroupPool(worker, () => {
        renderer._isDirty = true
      })
      this._anchorPool = new TransferableAnchorPool(worker, () => {
        renderer._isDirty = true
      })
      this._borderPool = new TransferableBorderPool(worker, (edges, count) => {
        renderer._receiveBorderEdges(edges, count)
      })
      // Single _postRenderHook slot shared by all three ring pools (F-C.7/
      // F-C.8 + CA-8/CA-6) -- a composite flushes each pool's bounce-back
      // independently.
      renderer._postRenderHook = (): void => {
        this._pool!.flushBounces()
        this._anchorPool!.flushBounces()
        this._borderPool!.flushBounces()
      }
      renderer._onViewChange = view => this._events.emit('viewChange', view)
      this._applyPendingCamera(renderer)
      renderer._resumeLoop()

      this._registry = registry
      this._renderer = renderer
      this._picker = new PointerPickResolver(
        renderer,
        registry,
        config.canvas,
        (event, payload) => this._events.emit(event, payload)
      )

      this._isLoaded = true
      this._isLoading = false
      // Nothing between `_applyPendingCamera` and this line awaits, so a
      // `setView()` call cannot land between the apply and this clear. A failed load keeps the
      // request for the retry, so the clear stays here.
      this._pendingCamera = null
    } catch (err) {
      if (partialRenderer && partialRenderer !== this._renderer) {
        partialRenderer.destroy()
      }
      // A dispose already reset the shared state, and a newer load may own it.
      if (generation !== this._loadGeneration) {
        throw err
      }
      this._rejectAck = null
      if (err instanceof WorkerStartError) {
        // Replace the dead worker so that a retry of loadMap() starts clean.
        worker.terminate()
        this._worker = this._spawnWorker()
      }
      this._isLoading = false
      throw err
    }
  }

  /**
   * Rejects all in-flight proxy calls with `MapInvalidatedError`, tears down
   * the renderer/Worker, and resolves. `destroy()` is the sync teardown
   * entry point and delegates here fire-and-forget.
   */
  async dispose(): Promise<void> {
    // Step 1: idempotent — never throws
    if (this._isDestroyed) return

    // A load in flight sees the new generation and rejects at its next check.
    this._loadGeneration++
    this._rejectAck?.(new MapInvalidatedError(CANCELLED_LOAD_MESSAGE))
    this._rejectAck = null

    // Step 0 (new): reject in-flight proxy calls before tearing anything down
    this._proxy?.rejectAll(new MapInvalidatedError())
    this._proxy = null
    this._pool?.dispose()
    this._pool = null
    this._anchorPool?.dispose()
    this._anchorPool = null
    this._borderPool?.dispose()
    this._borderPool = null
    this._borderCoalescer.reset()
    // CA-7: discard the registered palette data (Epic 4 Task 4.3).
    this._mapModes.clear()
    this._currentMapMode = null
    this._pendingCamera = null

    // Step 0b: clear frame callbacks
    this._frameCallbacks = []
    // Step 2: destroy renderer (disposes rAF, geometry, material, texture, MapRenderer listeners)
    if (this._renderer) {
      this._renderer.destroy()
    }

    // Step 3: clear event handler map
    this._events.clear()

    // Step 5: null out refs
    this._registry = null
    this._renderer = null
    this._picker = null
    this._isLoading = false

    // Steps 6–7: stop the worker, and mark destroyed only when loaded
    this._worker?.terminate()
    if (this._isLoaded) {
      this._isDestroyed = true
    } else {
      // If _isLoaded === false (partial failure), do NOT set _isDestroyed:
      // the next loadMap() starts a new worker and retries.
      this._worker = null
    }
  }

  /** Synchronous teardown entry point; delegates to `dispose()` fire-and-forget (ROADMAP §8 B3.c). */
  destroy(): void {
    void this.dispose()
  }

  /** @internal read by integration tests to verify the BOOTSTRAP round trip. */
  get lastBootstrapAck(): BootstrapAckPayload | null {
    return this._lastBootstrapAck
  }

  /** The live `MapRenderer` for the loaded map. Throws if destroyed or before `loadMap()` resolves. */
  get renderer(): MapRenderer {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._renderer!
  }

  /**
   * @deprecated Throws `MapInvalidatedError` once the bootstrap transfer has
   * detached this registry's buffers. Use `getSector`/`getSectorKeys`/
   * `getBBox`/`getCentroid`/`getNeighbors` instead.
   */
  get registry(): SectorRegistry {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    if (this._isRegistryInvalidated) throw new MapInvalidatedError()
    return this._registry!
  }

  /** Returns the `SectorData` for `hexKey`, or `undefined` if unknown. Throws if destroyed or not loaded. */
  getSector(hexKey: string): SectorData | undefined {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._registry!.getSector(hexKey)
  }

  /** Returns every known sector hex key. Throws if destroyed or not loaded. */
  getSectorKeys(): string[] {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._registry!.getSectorKeys()
  }

  // Returns the numeric id of a hex key (its index in `getSectorKeys()`), or
  // `undefined` for an unknown key. Throws if destroyed or not loaded.
  getSectorId(hexKey: string): number | undefined {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._registry!.getNumericId(hexKey)
  }

  // Returns the hex key of a numeric id, or `undefined` for an id out of
  // range. Throws if destroyed or not loaded.
  getSectorKey(id: number): string | undefined {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._registry!.idToHex[id]
  }

  /** Overrides a sector's fill color via the GPU palette LUT (O(1) write, no pixel iteration). Throws if destroyed or not loaded. */
  setSectorColor(hexKey: string, color: string): void {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    this._renderer!.setSectorColor(hexKey, color)
  }

  /** Restores a sector's fill color to its source-bitmap value. Throws if destroyed or not loaded. */
  resetSectorColor(hexKey: string): void {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
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
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded) throw new ModeNotReadyError('registerMapMode')
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
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded) throw new ModeNotReadyError('setMapMode')
    const colors = this._mapModes.get(id)
    if (!colors) throw new Error(`Unknown map mode: ${id}`)
    if (this._currentMapMode === id) return
    this._currentMapMode = id
    this._renderer!.setPalette(colors)
  }

  /** Adjacent sector ids for `id` — hex keys for a hex-string arg (`undefined` if the key is unknown), numeric ids for a numeric arg. Served from the Worker proxy snapshot. Throws if destroyed or not loaded. */
  getNeighbors(id: string): string[] | undefined
  getNeighbors(id: number): number[]
  getNeighbors(id: string | number): string[] | number[] | undefined {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
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

  /** Bounding box `[minX, minY, maxX, maxY]` (pixel space) for `id` (hex or numeric). Throws on an unknown sector, or if destroyed/not loaded. */
  getBBox(id: string): [number, number, number, number]
  getBBox(id: number): [number, number, number, number]
  getBBox(id: string | number): [number, number, number, number] {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    const numId = typeof id === 'number' ? id : this._registry!.getNumericId(id)
    if (numId === undefined)
      throw new Error(`MapEngine: unknown sector '${id}'`)
    return this._proxy!.getBBoxByNumericId(numId)
  }

  /** Centroid `[x, y]` in bitmap pixel space for `id` (hex or numeric). Throws on an unknown sector, or if destroyed/not loaded. */
  getCentroid(id: string): [number, number]
  getCentroid(id: number): [number, number]
  getCentroid(id: string | number): [number, number] {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
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
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
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
    this._areCostsReady = true
  }

  /**
   * Resolves the cost-optimal path between two sectors by numeric id
   * (CA-4), computed via A* over the CSR adjacency graph in the Worker.
   * Rejects with `CostsRequiredError` if `setTraversalCosts` has never
   * resolved, or `PathNotFoundError` if the sectors are not connected by
   * traversable edges.
   */
  async findPath(startId: number, endId: number): Promise<Uint16Array> {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    if (!this._areCostsReady) throw new CostsRequiredError()
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
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
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
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
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
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._pool!.getGroupBBox(groupId)
  }

  /**
   * Computes a guaranteed-interior label anchor (Pole of Inaccessibility,
   * CA-8) for every sector, computed in the Worker from B1.e contour
   * segments and delivered to Main via the Transferable ring pool.
   */
  async computeAnchors(): Promise<void> {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    await this._proxy!.call<void>('computeAnchors')
  }

  /**
   * Synchronous read of a sector's anchor point (CA-8), served from the
   * ring pool's Main-current snapshot, in bitmap pixel-space coordinates.
   * Throws a plain `Error` if `computeAnchors()` has never resolved, or
   * `RangeError` if `sectorId` is out of range.
   */
  getAnchor(sectorId: number): [number, number] {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._anchorPool!.getAnchor(sectorId)
  }

  /**
   * Recomputes group-perimeter border segments (CA-6) from the current
   * `parentMapping`, computed in the Worker from B1.e contour segments and
   * delivered to Main via the Transferable ring pool + a managed GPU VBO.
   * Rejects with `MappingRequiredError` if `setParentMapping` has never
   * resolved. Does NOT require `aggregateGroups()` to have run.
   *
   * Concurrent calls coalesce: at most one computation is in flight and at
   * most one more is queued behind it (≤ 2 Worker computations regardless of
   * caller count); every caller coalesced into the same queued computation
   * shares its resolution (resolve together, reject together). The queued
   * computation is not given an explicit "invalidate and resnapshot" signal
   * — it doesn't need one, since it hasn't dispatched its Worker CALL yet,
   * so it naturally reads whatever `parentMapping` is current at the moment
   * it actually runs, picking up any `setParentMapping` calls made while it
   * waited. The already-in-flight computation keeps computing against the
   * mapping it captured when *it* started, per the Worker-side snapshot in
   * `borderHandlers.ts`.
   *
   * Deliberately NOT declared `async`: an `async` method always wraps its
   * return value in a *new* Promise per call, even when returning an
   * already-existing Promise — which would defeat the "coalesced callers
   * share the exact same Promise" property this method relies on. Delegating
   * to `BorderCoalescer.request()` from a plain method preserves that identity.
   */
  recomputeBorders(): Promise<void> {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._borderCoalescer.request()
  }

  /**
   * Synchronous read of the last-resolved border segments (CA-6), as a flat
   * `[x1, y1, x2, y2, ...]` pixel-space array — a retained Main-side private
   * copy (independent of the pooled buffer bounced back to the Worker after
   * GPU upload). `null` before `recomputeBorders()` has ever resolved; a
   * zero-edge (sentinel) resolution returns `Float32Array(0)`, not `null`.
   */
  getBorderSegments(): Float32Array | null {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._renderer!.getBorderSegments()
  }

  /**
   * Toggles border-line visibility (CA-6) without recomputing or
   * re-uploading anything. Safe to call before `recomputeBorders()` has
   * ever resolved -- the choice is remembered and applied once borders
   * exist.
   */
  setBordersVisible(isVisible: boolean): void {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    this._renderer!.setBordersVisible(isVisible)
  }

  /**
   * Projects a bitmap pixel-space coordinate to CSS screen-space coordinates
   * (canvas-relative, top-left origin), honoring the live camera pan/zoom.
   * A pure-number transform -- no Three.js type crosses this boundary (PR-4).
   */
  project(x: number, y: number): [number, number] {
    if (this._isDestroyed) throw new Error('MapEngine: destroyed')
    if (!this._isLoaded)
      throw new Error('MapEngine: not loaded — call loadMap() first')
    return this._renderer!.project(x, y)
  }

  // Returns the camera view in bitmap pixels, or `null` before `loadMap()` has
  // resolved. Throws once destroyed.
  getView(): MapView | null {
    if (this._isDestroyed) {
      throw new Error('MapEngine: destroyed')
    }
    if (!this._isLoaded) {
      return null
    }
    return this._renderer!._getView()
  }

  // Sets the camera; an omitted field keeps its value. Zoom clamps to [0.5,
  // 20] and the center to the bitmap. Before load it stores one request (the
  // last call wins) that `loadMap()` applies before the first frame. Throws
  // `RangeError` on a non-finite number, and once destroyed.
  setView(view: Partial<MapView>): void {
    if (this._isDestroyed) {
      throw new Error('MapEngine: destroyed')
    }
    assertFinite('setView', 'centerX', view.centerX ?? 0)
    assertFinite('setView', 'centerY', view.centerY ?? 0)
    assertFinite('setView', 'zoom', view.zoom ?? 1)
    if (!this._isLoaded) {
      this._pendingCamera = { kind: 'view', view: { ...view } }
      return
    }
    this._renderer!._setView(view)
  }

  // Frames a `[minX, minY, maxX, maxY]` bbox of inclusive pixel indices, such
  // as `getBBox()` returns. `padding` keeps CSS pixels clear on each side;
  // `keepOnResize` fits again on each canvas resize until the next user pan or
  // zoom, `setView()`, or `fitBounds()`. Before load it stores one request
  // that `loadMap()` applies before the first frame. Zoom clamps to [0.5, 20],
  // so a very small box or a large padding does not fill the canvas. Throws
  // `RangeError` on a bad bbox, padding, or fit, and once destroyed.
  fitBounds(bbox: BBox, options: FitBoundsOptions = {}): void {
    if (this._isDestroyed) {
      throw new Error('MapEngine: destroyed')
    }
    const [minX, minY, maxX, maxY] = bbox
    assertFinite('fitBounds', 'minX', minX)
    assertFinite('fitBounds', 'minY', minY)
    assertFinite('fitBounds', 'maxX', maxX)
    assertFinite('fitBounds', 'maxY', maxY)
    if (minX > maxX || minY > maxY) {
      throw new RangeError('MapEngine.fitBounds: bbox must have min <= max')
    }
    const padding = options.padding ?? 0
    assertFinite('fitBounds', 'padding', padding)
    if (padding < 0) {
      throw new RangeError('MapEngine.fitBounds: padding must be >= 0')
    }
    const fit = options.fit ?? 'contain'
    if (fit !== 'contain' && fit !== 'cover') {
      throw new RangeError(
        'MapEngine.fitBounds: fit must be "contain" or "cover"'
      )
    }
    if (!this._isLoaded) {
      this._pendingCamera = {
        kind: 'fit',
        bbox: [minX, minY, maxX, maxY],
        options: { ...options },
      }
      return
    }
    this._renderer!._fitBounds(
      bbox,
      padding,
      options.keepOnResize ?? false,
      fit
    )
  }

  // Runs before the loop resumes, so the first rendered frame has the view.
  private _applyPendingCamera(renderer: MapRenderer) {
    const pending = this._pendingCamera
    if (!pending) {
      return
    }
    if (pending.kind === 'view') {
      renderer._setView(pending.view)
      return
    }
    const {
      padding = 0,
      keepOnResize = false,
      fit = 'contain',
    } = pending.options
    renderer._fitBounds(pending.bbox, padding, keepOnResize, fit)
  }

  private _throwIfCancelled(generation: number) {
    if (generation !== this._loadGeneration) {
      throw new MapInvalidatedError(CANCELLED_LOAD_MESSAGE)
    }
  }

  // Wraps the worker seam with listeners that turn a start failure into
  // `WorkerStartError`. They attach at creation, because the `error` event of
  // a script that did not load fires before `loadMap()` listens.
  private _spawnWorker(): Worker {
    const worker = this._createWorker()
    const fail = (detail: string) => {
      if (worker !== this._worker || this._isLoaded) {
        return
      }
      this._workerFailure = new WorkerStartError(detail)
      this._rejectAck?.(this._workerFailure)
    }
    worker.addEventListener('error', error =>
      fail(error.message || 'the worker script did not load')
    )
    worker.addEventListener('messageerror', () =>
      fail('a message could not be deserialized')
    )
    // A failure of an earlier worker does not carry over to this one.
    this._workerFailure = null
    return worker
  }

  /** Spins up the module Worker from the bundled worker entry. Called at construction and again on every `loadMap()` reload — a fresh Worker means a fresh, empty registry/graph. */
  private _createWorker(): Worker {
    return new Worker(new URL('../worker/index.ts', import.meta.url), {
      type: 'module',
    })
  }
}
