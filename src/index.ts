/**
 * Package entry point. Every public symbol is re-exported by name;
 * `MapEngine as default` is the single sanctioned default-export alias —
 * add no other default export.
 */
export type * from './shared/types.js'
export {
  SectorLimitExceededError,
  WebGL2NotSupportedError,
  MappingRequiredError,
  PathNotFoundError,
  CostsRequiredError,
  ModeNotReadyError,
  MapInvalidatedError,
  WorkerStartError,
} from './shared/errors.js'
export { toHexKey } from './shared/utils.js'
export { SectorBitmapParser } from './sector/SectorBitmapParser.js'
export { SectorRegistry } from './sector/SectorRegistry.js'
export { MapRenderer } from './core/MapRenderer.js'
export { MapEngine } from './core/MapEngine.js'
export { MapEngine as default } from './core/MapEngine.js'
export { RenderClock } from './core/RenderClock.js'
