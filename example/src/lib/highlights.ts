import type MapEngine from 'map-engine'

/**
 * Overlay layers, highest priority first. To add a new overlay, insert its
 * name at the correct precedence position — nothing else in the app changes.
 */
export const LAYER_ORDER = [
  'selected',
  'path',
  'neighbor',
  'region',
  'hover',
] as const
export type Layer = (typeof LAYER_ORDER)[number]

/**
 * Declarative per-sector overlay manager. Each sector holds a map of active
 * layers → color; the visible color is the highest-priority active layer.
 * Features set/clear only their own layer and never inspect another's, so all
 * precedence lives in `reconcile`. Replaces the former hand-synced
 * restoreSectorBaseColor / resetPathHighlights / resetNeighborHighlights chains.
 */
export class HighlightLayers {
  private readonly bySector = new Map<string, Map<Layer, string>>()
  private readonly engine: MapEngine

  /** Captures the engine used for all repaints. (Explicit field + assignment — constructor parameter properties are banned by erasableSyntaxOnly, §1.5.) */
  constructor(engine: MapEngine) {
    this.engine = engine
  }

  /** Sets `layer`'s color on `hex`, then repaints the sector to its top layer. */
  set(hex: string, layer: Layer, color: string): void {
    let layers = this.bySector.get(hex)
    if (!layers) this.bySector.set(hex, (layers = new Map()))
    layers.set(layer, color)
    this.reconcile(hex)
  }

  /** Removes `layer` from `hex`, then repaints to the next layer down (or base). */
  clear(hex: string, layer: Layer): void {
    const layers = this.bySector.get(hex)
    if (!layers || !layers.delete(layer)) return
    if (layers.size === 0) this.bySector.delete(hex)
    this.reconcile(hex)
  }

  /** Removes `layer` from every sector carrying it (bulk teardown). */
  clearLayer(layer: Layer): void {
    for (const hex of [...this.bySector.keys()]) this.clear(hex, layer)
  }

  /** Repaints `hex` to its highest-priority active layer, or resets to base. */
  private reconcile(hex: string): void {
    const layers = this.bySector.get(hex)
    if (layers) {
      for (const layer of LAYER_ORDER) {
        const color = layers.get(layer)
        if (color !== undefined) {
          this.engine.setSectorColor(hex, color)
          return
        }
      }
    }
    this.engine.resetSectorColor(hex)
  }
}
