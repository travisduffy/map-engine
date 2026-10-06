/** Thrown when a map exceeds the hard sector limit of 65,534 (sentinel 0xFFFF reserved). */
export class SectorLimitExceededError extends Error {
  /** Builds the error naming the offending sector `count` against the 65,534 hard limit. */
  constructor(count: number) {
    super(
      `SectorRegistry: sector count ${count} exceeds the hard limit of 65,534. Map cannot be loaded.`
    )
    this.name = 'SectorLimitExceededError'
  }
}

/** Thrown at `ThreeRenderBackend` construction when the canvas cannot provide a WebGL2 context. */
export class WebGL2NotSupportedError extends Error {
  /** Builds the fixed WebGL2-unavailable message. */
  constructor() {
    super(
      'map-engine requires WebGL2; the provided canvas could not create a WebGL2 context.'
    )
    this.name = 'WebGL2NotSupportedError'
  }
}

/**
 * Thrown by group/mapping accessors invoked before their required precondition:
 * `aggregateGroups()` before `setParentMapping()` has resolved, or `getGroupBBox()`
 * before the first `aggregateGroups()` resolution.
 */
export class MappingRequiredError extends Error {
  /** Builds the error, defaulting to the "parent mapping must be set" message when none is supplied. */
  constructor(message = 'A parent mapping must be set before this operation.') {
    super(message)
    this.name = 'MappingRequiredError'
  }
}

/** Thrown by `findPath` when the start and end sectors are not connected by traversable edges. */
export class PathNotFoundError extends Error {
  /** Builds the error naming the disconnected `startId` and `endId` sectors. */
  constructor(startId: number, endId: number) {
    super(`No path exists between sector ${startId} and sector ${endId}.`)
    this.name = 'PathNotFoundError'
  }
}

/** Thrown by `findPath` when called before `setTraversalCosts` has resolved at least once. */
export class CostsRequiredError extends Error {
  /** Builds the fixed "setTraversalCosts must resolve first" message. */
  constructor() {
    super(
      'findPath: setTraversalCosts must resolve at least once before findPath is called.'
    )
    this.name = 'CostsRequiredError'
  }
}

/** Thrown by `registerMapMode`/`setMapMode` when called before `loadMap()` has resolved. */
export class ModeNotReadyError extends Error {
  /** Builds the error naming the `method` that was called before `loadMap()` resolved. */
  constructor(method: string) {
    super(`${method}: cannot be called before loadMap() has resolved.`)
    this.name = 'ModeNotReadyError'
  }
}

/**
 * Thrown by buffer-backed registry methods (e.g. the deprecated `engine.registry` getter)
 * once the bootstrap transfer has detached their backing buffers, and used to reject
 * in-flight async Promises on `loadMap()`/`dispose()`.
 */
export class MapInvalidatedError extends Error {
  /** Builds the error, defaulting to the "buffers transferred or disposed" message when none is supplied. */
  constructor(
    message = 'This map instance has been invalidated (buffers transferred or disposed).'
  ) {
    super(message)
    this.name = 'MapInvalidatedError'
  }
}

// Thrown by `loadMap()` when the Worker fails before it acknowledges
// BOOTSTRAP: its script did not load, or it threw during start.
export class WorkerStartError extends Error {
  constructor(detail: string) {
    super(
      `MapEngine: the worker failed before it acknowledged BOOTSTRAP (${detail}). The worker chunk sits in dist/assets, and its URL is relative to dist/index.js. Serve dist/assets with dist/index.js.`
    )
    this.name = 'WorkerStartError'
  }
}
