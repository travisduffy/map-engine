import type MapEngine from 'map-engine'
import type { HighlightLayers } from './highlights'

/** Shared dependencies injected into every feature at construction. */
export interface AppContext {
  readonly engine: MapEngine
  readonly highlights: HighlightLayers
  /** idToHex — array index === numeric sector id (getSectorKeys() order). */
  readonly sectorKeys: string[]
  /** Inverse of sectorKeys — hex key → numeric sector id. */
  readonly hexToId: Map<string, number>
  readonly canvas: HTMLCanvasElement
}

/** A self-contained UI feature bound to one sidebar section. */
export interface Feature {
  /** Query DOM, subscribe to engine events/frames, wire listeners. */
  mount(): void | Promise<void>
  /** Unsubscribe, remove listeners, reset owned DOM/state. */
  destroy(): void
}

export type FeatureFactory = (ctx: AppContext) => Feature
