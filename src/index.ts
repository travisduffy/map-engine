/**
 * Package entry point. Every public symbol is re-exported by name;
 * `MapEngine as default` is the single sanctioned default-export alias —
 * add no other default export.
 */
export type * from './shared/types'
export {
  SectorLimitExceededError,
  WebGL2NotSupportedError,
  MappingRequiredError,
  PathNotFoundError,
  CostsRequiredError,
  ModeNotReadyError,
  MapInvalidatedError,
} from './shared/errors'
export { toHexKey } from './shared/utils'
export { SectorBitmapParser } from './sector/SectorBitmapParser'
export { SectorRegistry } from './sector/SectorRegistry'
export { MapRenderer } from './core/MapRenderer'
export { MapEngine } from './core/MapEngine'
export { MapEngine as default } from './core/MapEngine'
export { RenderClock } from './core/RenderClock'
