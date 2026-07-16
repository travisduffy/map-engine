# Example App Refactor Plan

Target: refactor `example/` from the current three-file god-class layout
(`main.ts` + `controller.ts` [739 lines] + `ui.ts` [377 lines]) into a modern,
per-feature vanilla-TS architecture — feature modules with a `mount`/`destroy`
lifecycle, a declarative highlight-layer overlay model, and a thin composition
root. The refactor hardens the app (symmetric teardown, one place for overlay
precedence, feature-owned DOM) while sharpening its role as the project's
teach-by-example API showcase.

This plan is written to be executed by a weaker model. It gives full source for
the shared primitives and three representative features, and exact specs
(source lines, DOM ids, engine calls, mount/destroy steps) for the rest. Follow
it top to bottom.

---

## 0. Why (the problems this fixes)

Grounded in the current code (`example/src/controller.ts`, `ui.ts`,
`index.html`, `style.css`):

1. **`AppController` is a 739-line god-class** owning ~25 state fields across 10
   feature demos, with one hand-maintained `resetState()` (controller.ts:371–408)
   that must mirror every field and every UI-clear call. Adding a feature means
   editing state fields, `wireControls`, `startEngine`, and `resetState` — four
   scattered sites, easy to half-do.
2. **Overlay precedence is duplicated across four hand-synced sites.** The order
   `path > neighbor > region > none` is re-encoded in `restoreSectorBaseColor`
   (controller.ts:414–424), `resetPathHighlights` (545–559),
   `resetNeighborHighlights` (627–643), plus write-side "don't stomp" guards
   (onHover 435–440, selectRegion 255–260). Colors `#aaccff` (neighbor) and
   `#e8e8d0` (hover) are inline literals repeated 3× and 2×. Miss one site and
   layers stomp each other on hover-out.
3. **`ui.ts` resolves all ~19 DOM refs at module load** and exports a flat
   grab-bag of `render*/set*/clear*` functions with no per-feature cohesion.
4. **Teardown is asymmetric**: `stopEngine` explicitly `offFrame`s only
   `onClockFrame` (365), relying on `destroy()` for `onFrameTick`; the failed-load
   path (controller.ts:135–142) skips `resetState()` entirely.
5. **The controller reaches into `document`** (the `getElementById` block at
   controller.ts:646–658) — already a violation of the current
   `example-app.md` boundary rule.

The target architecture makes each feature a self-contained module that owns its
state, its DOM, its subscriptions, and — critically — its own teardown. A single
`HighlightLayers` object owns all overlay precedence. `resetState()` disappears.

---

## 1. Target architecture

### 1.1 Directory tree

```
example/src/
  main.ts                 # entry: grab canvas, construct App, app.start()
  app.ts                  # App: engine lifecycle + feature registry + reload()
  lib/
    feature.ts            # Feature interface, FeatureFactory, AppContext
    highlights.ts         # HighlightLayers — declarative overlay precedence
    colors.ts             # all overlay color constants (hoisted literals)
    dom.ts                # shared DOM helpers + setStatus (from ui.ts 55–131)
  features/
    sector-list.ts        # sector list panel + toHexKey round-trip demo
    hover.ts              # hover panel + hover highlight + hover checkbox
    selection.ts          # selected+advanced+neighbor panels, pulse, neighbors
    frame-hook.ts         # frame counter
    clock.ts              # game-clock accumulator + speed/pause controls
    pathfinding.ts        # right-click path pick, findPath, clear button
    regions.ts            # aggregation: parentMapping, region buttons, bbox
    borders.ts            # group perimeter show/hide
    anchors.ts            # anchor/centroid markers, per-frame reprojection
    map-modes.ts          # default / grayscale buttons
```

`index.html`, `style.css`, `public/map.png`, `public/sectors.json`,
`vite.config.ts`, `tsconfig.json`, `package.json` are unchanged except the
optional CSS-class rename in Step 7. All existing element **ids are reused**.

### 1.2 The three core ideas

- **Feature modules.** Each feature is a factory `createX(ctx): Feature`
  returning `{ mount, destroy }`. It owns its panel's DOM (queried in `mount`),
  its state (closure `let`s — no class fields, so the `_`-prefix question is
  moot), its engine subscriptions, and its listeners (via one `AbortController`).
- **Declarative highlights.** `HighlightLayers` holds, per sector, a set of named
  layers with colors, and paints each sector to its highest-priority layer. A
  feature only ever sets/clears *its own* layer and never inspects another's. All
  precedence lives in one `reconcile()` method. This deletes
  `restoreSectorBaseColor`, `resetPathHighlights`, `resetNeighborHighlights`, and
  every "don't stomp" guard.
- **Composition root.** `App` constructs the engine, loads the map, builds the
  shared `AppContext`, instantiates every feature, and mounts them. `reload()` is
  just *destroy every feature → destroy engine → start again* — symmetric,
  no `resetState()`.

### 1.3 Design decision: NO signal/store primitive

An earlier sketch proposed a `signal<T>()` primitive for shared `selectedHex` /
`hoveredHex` state. **Drop it.** Once `HighlightLayers` centralizes all coloring,
no feature needs to read another feature's selection/hover state — layer
precedence resolves every interaction (e.g. hover unconditionally sets its
lowest-priority `hover` layer; if the sector is selected, `selected` outranks it
automatically). The only cross-feature data is the id-bridge (`sectorKeys`,
`hexToId`), which is immutable read-only data computed once at load — a plain
field on `AppContext`, not reactive state. Adding signals here would be
over-engineering with no consumer. This is a deliberate, documented rejection.

### 1.4 Design decision: AbortController for DOM listeners

Every feature creates one `const ac = new AbortController()` and passes
`{ signal: ac.signal }` to every `addEventListener`. `destroy()` calls
`ac.abort()` to remove them all at once. Engine subscriptions (`on`/`off`,
`onFrame`/`offFrame`) are not signal-based, so features hold the handler
reference and call `engine.off`/`offFrame` explicitly in `destroy()`.

### 1.5 TypeScript constraints (inherited from the root tsconfig — build fails if ignored)

`example/tsconfig.json` extends the root config, which sets three options every
new file must respect:

- **`erasableSyntaxOnly: true`** — constructor parameter properties are banned.
  Declare an explicit field and assign it in the constructor body
  (`constructor(engine: MapEngine) { this.engine = engine }`); never write
  `constructor(private engine: MapEngine)`. Enums and namespaces are banned too.
  All source in this plan already complies — do not "simplify" it back.
- **`verbatimModuleSyntax: true`** — every type-only import must use
  `import type`. Importing a type without the `type` keyword fails typecheck.
- **`noUnusedLocals` / `noUnusedParameters: true`** — never import a symbol or
  declare a variable/parameter you don't use; it fails typecheck.

---

## 2. Shared primitives (full source)

### 2.1 `example/src/lib/colors.ts`

Hoists every overlay color literal into one place (fixes the `#aaccff`×3 /
`#e8e8d0`×2 duplication). The pulse color is computed per-frame and stays inline
in `selection.ts`.

```ts
/** Overlay highlight colors, shared across features. */
export const HOVER_COLOR = '#e8e8d0'
export const NEIGHBOR_COLOR = '#aaccff'
export const REGION_COLOR = '#b39ddb'
export const PATH_START_COLOR = '#ffcc00'
export const PATH_ROUTE_COLOR = '#ff6a00'
```

### 2.2 `example/src/lib/highlights.ts`

```ts
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
```

Precedence rationale (derived from current behavior): `selected` (the animated
pulse) always shows on the selected sector; `path` > `neighbor` > `region`
matches the existing restore chain; `hover` is lowest — today's onHover guard
(controller.ts:435–440) only paints hover on otherwise-unowned sectors, which
`reconcile` reproduces automatically.

One intentional normalization: the current app's write-guards are mutually
inconsistent — `selectRegion` skips a currently-hovered sector
(controller.ts:258, hover beats region on that write path) while `onHover`
refuses to paint over a region sector (region beats hover on the other). The
layer model resolves this deterministically: `region` > `hover`, always. The
only visible difference is that selecting a region now recolors a member sector
even while the pointer rests on it. This is expected — do not "fix" it back.

### 2.3 `example/src/lib/feature.ts`

```ts
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
```

### 2.4 `example/src/lib/dom.ts`

Move these verbatim from the current `ui.ts` (lines noted), plus `setStatus`.
These are the shared, cross-feature builders; keep them identical to preserve the
CSS-injection guard and DOM structure.

```ts
import type { SectorData } from 'map-engine'

const statusEl = document.getElementById('status')!

/** Writes the bottom-left map status overlay. */
export function setStatus(msg: string): void {
  statusEl.textContent = msg
}

// --- moved verbatim from ui.ts:55–125 ---
// assertSafeHexKey  (ui.ts:55–59)   — CSS-injection guard; keep exactly
// makeInfoRow       (ui.ts:61–73)
// makeSwatchSpan    (ui.ts:75–80)
// makeHexRow        (ui.ts:82–97)
// makeSkeletonRow   (ui.ts:99–113)
// buildSectorDataRows (ui.ts:115–125)
```

Export all six helpers (they are currently module-private in `ui.ts`; they must
be exported here because Hover, Selection, Regions, and Sector-list all consume
them). Import **only** `SectorData` (used by `buildSectorDataRows`) — no helper
references `PickResult`, and an unused import fails typecheck under
`noUnusedLocals` (§1.5).

---

## 3. Composition root (full source)

### 3.1 `example/src/app.ts`

```ts
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
```

Teardown order is load-bearing: features `destroy()` first, then
`engine.destroy()`. Verified engine semantics: `off()` **throws**
`'MapEngine: destroyed'` once the engine is destroyed, while `offFrame()` and
`onFrame()` are safe no-ops after destroy — so any feature calling `off()` in
its `destroy()` must run before `engine.destroy()`. This mirrors the current
`stopEngine` order and fixes the offFrame asymmetry (every feature now
unregisters its own frame callback). Also verified: `on()` is Set-backed, so
re-registering the same handler twice is harmless (no double-dispatch).

The `isBusy` guard makes `reload()` safe against double-clicks and against a
Reload click landing mid-`start()` (which would otherwise destroy the engine
while `loadMap`/feature mounts are in flight).

### 3.2 `example/src/main.ts`

```ts
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
```

The advanced `SectorBitmapParser`/`SectorRegistry` comment block is preserved
here (it is required teaching content — see Invariant 1). The `chk-hover`
checkbox is no longer grabbed in `main.ts`; the Hover feature owns it.

---

## 4. Representative features (full source)

These three establish the pattern (simple / stateful+animated / async+bridge).
Write the remaining seven from the specs in §5 using the same shape.

### 4.1 `example/src/features/hover.ts`

```ts
import type { PickResult } from 'map-engine'
import type { AppContext, Feature } from '../lib/feature'
import { HOVER_COLOR } from '../lib/colors'
import { buildSectorDataRows, makeInfoRow, makeSkeletonRow } from '../lib/dom'

const SKELETON = ['hex', 'name', 'population', 'capital', 'climate', 'pixel']

/** Hover panel + hover highlight; the checkbox toggles the subscription. */
export function createHover(ctx: AppContext): Feature {
  const content = document.getElementById('hover-content')!
  const checkbox = document.getElementById('chk-hover') as HTMLInputElement
  const ac = new AbortController()
  let lastHovered: string | null = null
  let isEnabled = true

  const clearPanel = (): void => {
    content.replaceChildren(...SKELETON.map(makeSkeletonRow))
  }

  const onHover = (result: PickResult | null): void => {
    if (lastHovered) {
      ctx.highlights.clear(lastHovered, 'hover')
      lastHovered = null
    }
    if (result) {
      ctx.highlights.set(result.hexKey, 'hover', HOVER_COLOR)
      lastHovered = result.hexKey
      content.replaceChildren(
        ...buildSectorDataRows(result.sectorData, result.hexKey),
        makeInfoRow('pixel', `(${result.pixelX}, ${result.pixelY})`)
      )
    } else {
      clearPanel()
    }
  }

  const onToggle = (): void => {
    isEnabled = checkbox.checked
    if (isEnabled) {
      ctx.engine.on('sectorHover', onHover)
    } else {
      ctx.engine.off('sectorHover', onHover)
      if (lastHovered) {
        ctx.highlights.clear(lastHovered, 'hover')
        lastHovered = null
      }
      clearPanel()
    }
  }

  return {
    mount() {
      clearPanel()
      checkbox.checked = true
      isEnabled = true
      ctx.engine.on('sectorHover', onHover)
      checkbox.addEventListener('change', onToggle, { signal: ac.signal })
    },
    destroy() {
      ac.abort()
      if (isEnabled) ctx.engine.off('sectorHover', onHover)
      if (lastHovered) ctx.highlights.clear(lastHovered, 'hover')
      lastHovered = null
    },
  }
}
```

Note the simplification: hover no longer checks `selectedHex`, `previousNeighbors`,
`pathSectors`, or `regionSectors` — it unconditionally sets the lowest-priority
`hover` layer, and precedence handles the rest. The former "re-hover on deselect"
logic (controller.ts:463–465) is unnecessary: the `hover` layer stays set while
the pointer is over a sector, so deselecting reveals it automatically.

Behavior normalization: `mount()` resets the checkbox to checked. The current
app leaves the checkbox unchecked across a reload yet re-subscribes the hover
handler anyway (startEngine:122 ignores the checkbox — a live bug). Forcing
`checked = true` on mount makes the UI and the subscription agree. Programmatic
`checkbox.checked = true` does not fire a `change` event, so no double-subscribe
occurs (and `on()` is Set-backed regardless).

### 4.2 `example/src/features/selection.ts`

Owns the Selected panel, the Advanced (registry) panel, the Neighbors panel, the
selection pulse, and neighbor highlighting — these are one tightly-coupled unit
in the current `onClick` (controller.ts:454–479).

```ts
import type { PickResult } from 'map-engine'
import type { AppContext, Feature } from '../lib/feature'
import { NEIGHBOR_COLOR } from '../lib/colors'
import { buildSectorDataRows, makeInfoRow, makeSkeletonRow } from '../lib/dom'

const SELECTED_SKELETON = ['hex', 'name', 'population', 'capital', 'climate']
const ADVANCED_SKELETON = ['bbox', 'centroid', 'pixels']

/** Selected + advanced + neighbor panels, hue pulse, neighbor highlighting. */
export function createSelection(ctx: AppContext): Feature {
  const selectedContent = document.getElementById('selected-content')!
  const advancedContent = document.getElementById('advanced-content')!
  const neighborOutput = document.getElementById('neighbor-output')!
  let selectedHex: string | null = null
  let pulsePhase = 0

  const clearPanels = (): void => {
    selectedContent.classList.add('empty-state')
    selectedContent.replaceChildren(...SELECTED_SKELETON.map(makeSkeletonRow))
    advancedContent.replaceChildren(...ADVANCED_SKELETON.map(makeSkeletonRow))
  }

  const clearNeighbors = (): void => {
    ctx.highlights.clearLayer('neighbor')
    neighborOutput.textContent = '—'
  }

  const deselect = (): void => {
    if (!selectedHex) return
    ctx.highlights.clear(selectedHex, 'selected')
    selectedHex = null
    pulsePhase = 0
    clearNeighbors()
    clearPanels()
  }

  const onClick = (result: PickResult): void => {
    if (selectedHex === result.hexKey) {
      deselect()
      return
    }
    deselect()
    selectedHex = result.hexKey
    pulsePhase = 0

    selectedContent.classList.remove('empty-state')
    selectedContent.replaceChildren(
      ...buildSectorDataRows(result.sectorData, result.hexKey)
    )
    const bbox = ctx.engine.getBBox(result.hexKey)
    const centroid = ctx.engine.getCentroid(result.hexKey)
    advancedContent.replaceChildren(
      makeInfoRow('bbox', `${bbox[0]},${bbox[1]} → ${bbox[2]},${bbox[3]}`),
      makeInfoRow(
        'centroid',
        `(${centroid[0].toFixed(1)}, ${centroid[1].toFixed(1)})`
      )
    )

    const ns = ctx.engine.getNeighbors(result.hexKey)
    const shown: string[] = []
    if (ns) {
      for (const hex of ns) {
        ctx.highlights.set(hex, 'neighbor', NEIGHBOR_COLOR)
        shown.push(hex)
      }
    }
    neighborOutput.textContent = shown.length > 0 ? shown.join(', ') : '(none)'
  }

  const onFrame = (dt: number): void => {
    if (!selectedHex) return
    pulsePhase = (pulsePhase + dt * 1.5) % 1
    const hue = Math.round(pulsePhase * 360)
    ctx.highlights.set(selectedHex, 'selected', `hsl(${hue}, 90%, 55%)`)
  }

  return {
    mount() {
      clearPanels()
      neighborOutput.textContent = '—'
      ctx.engine.on('sectorClick', onClick)
      ctx.engine.onFrame(onFrame)
    },
    destroy() {
      ctx.engine.off('sectorClick', onClick)
      ctx.engine.offFrame(onFrame)
      deselect()
    },
  }
}
```

The `getNeighbors` "skip if === selectedHex" guard (controller.ts:618) is dropped
— a neighbor equal to the selected sector shows `selected` (higher priority)
automatically. The pulse routes through the `selected` layer each frame; because
`selected` is top priority, this is equivalent to the former direct
`setSectorColor` but participates in the same precedence model.

Two deliberate details: (1) no membership `Set` is kept for neighbors —
`clearLayer('neighbor')` IS the bookkeeping; do not add one. (2) `clearPanels`
re-adds the `empty-state` class, which the current app removes on first render
and never restores (a styling inconsistency); the new behavior is uniformly
styled skeletons — intentional, do not chase it as a regression.

### 4.3 `example/src/features/pathfinding.ts`

```ts
import { PathNotFoundError } from 'map-engine'
import type { AppContext, Feature } from '../lib/feature'
import { PATH_START_COLOR, PATH_ROUTE_COLOR } from '../lib/colors'

/** Right-click to set start then end; findPath() route highlighting. */
export function createPathfinding(ctx: AppContext): Feature {
  const output = document.getElementById('pathfinding-output')!
  const clearBtn = document.getElementById('btn-path-clear')!
  const ac = new AbortController()
  let startHex: string | null = null

  const clearPath = (): void => ctx.highlights.clearLayer('path')
  const resetOutput = (): void => {
    output.textContent = 'Right-click two sectors to find a path'
  }

  const onContextMenu = (e: MouseEvent): void => {
    e.preventDefault()
    void handlePick(e.clientX, e.clientY)
  }

  const handlePick = async (
    clientX: number,
    clientY: number
  ): Promise<void> => {
    const result = await ctx.engine.pick({ clientX, clientY })
    // A Reload can destroy this feature while pick() was in flight.
    if (ac.signal.aborted || !result) return

    if (!startHex) {
      clearPath()
      startHex = result.hexKey
      ctx.highlights.set(result.hexKey, 'path', PATH_START_COLOR)
      output.textContent = `Start: #${result.hexKey} — right-click an end sector`
      return
    }

    const from = startHex
    const to = result.hexKey
    startHex = null
    if (from === to) {
      clearPath()
      resetOutput()
      return
    }

    const startId = ctx.hexToId.get(from)
    const endId = ctx.hexToId.get(to)
    if (startId === undefined || endId === undefined) return

    output.textContent = `Finding path from #${from} to #${to}…`
    try {
      const path = await ctx.engine.findPath(startId, endId)
      if (ac.signal.aborted) return
      clearPath()
      const hexPath = Array.from(path).map(id => ctx.sectorKeys[id])
      for (const hex of hexPath) ctx.highlights.set(hex, 'path', PATH_ROUTE_COLOR)
      output.textContent = `Path: ${hexPath.length} sectors — #${hexPath.join(' → #')}`
    } catch (err) {
      if (ac.signal.aborted) return
      clearPath()
      output.textContent =
        err instanceof PathNotFoundError
          ? `No path exists between #${from} and #${to}`
          : `Pathfinding failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  return {
    async mount() {
      await ctx.engine.setTraversalCosts(
        new Uint8Array(ctx.sectorKeys.length).fill(1)
      )
      resetOutput()
      ctx.canvas.addEventListener('contextmenu', onContextMenu, {
        signal: ac.signal,
      })
      clearBtn.addEventListener(
        'click',
        () => {
          startHex = null
          clearPath()
          resetOutput()
        },
        { signal: ac.signal }
      )
    },
    destroy() {
      ac.abort()
      clearPath()
      startHex = null
    },
  }
}
```

The former `pathHighlightColor` field is gone: start and route colors are stored
per-hex inside the `path` layer. `clearLayer('path')` replaces the manual
`resetPathHighlights` fall-through.

The `ac.signal.aborted` checks after each `await` are the abort-guard pattern:
any feature that awaits an engine call from a user gesture must re-check the
signal after the await, because a Reload may have destroyed the feature (and be
about to destroy the engine) while the promise was in flight. Borders and
Anchors need the same guard after their lazy compute awaits (§5.5, §5.6).

---

## 5. Remaining features (specs)

Each follows the §4 template: query DOM in `mount`, one `AbortController` for
listeners, engine subscriptions unsubscribed in `destroy`, highlight layers via
`ctx.highlights`. Source-line references point at the current `controller.ts` /
`ui.ts` logic to port.

### 5.1 `sector-list.ts`
- **DOM:** `#sector-count`, `#sector-list`.
- **State:** none.
- **mount:** render one `<li.sector-item>` per `ctx.sectorKeys` (swatch + name via
  `ctx.engine.getSector(key)?.name` + `#key`); set `#sector-count` text. Port
  `renderSectorList` (ui.ts:182–206); reuse `assertSafeHexKey` from `dom.ts`.
  Then run the **`toHexKey` round-trip demo** (controller.ts:164–178) on
  `sectorKeys[0]` — this is the sole demonstration of `toHexKey` and must be
  preserved (import `toHexKey` from `'map-engine'`).
- **destroy:** set `#sector-count` to `'0'`, empty `#sector-list`.

### 5.2 `frame-hook.ts`
- **DOM:** `#frame-counter`.
- **State:** `frameCount = 0`.
- **mount:** `ctx.engine.onFrame(cb)` where `cb` increments and writes
  `Frames: ${n}` (controller.ts:598–600).
- **destroy:** `offFrame(cb)`; set text `Frames: 0`.

### 5.3 `clock.ts`
- **DOM:** `#tick-counter`, `#clock-speed`, `#btn-clock-pause`,
  `#btn-clock-speed-half`, `#btn-clock-speed-1`, `#btn-clock-speed-2`,
  `#btn-clock-speed-5`.
- **State:** `speed=1`, `lastSpeed=1`, `elapsed=0`, `accumulator=0`; consts
  `INTERVAL_SECONDS=1`, `MAX_TICKS_PER_FRAME=10`.
- **mount:** `onFrame` = the fixed-tick accumulator verbatim from
  controller.ts:569–587 (pause when `speed===0`, drain whole ticks up to the cap,
  discard remainder if the cap is hit). Wire pause (swap `speed`↔`lastSpeed`,
  controller.ts:690–700) and the four speed buttons (`setClockSpeedValue`,
  controller.ts:589–596) via `AbortController`. Helpers: write `Ticks: ${n}`,
  `Speed: ${n}×`, pause-button label `Pause`/`Resume`.
- **destroy:** `offFrame`; `ac.abort()`; reset labels to `Ticks: 0`, `Speed: 1×`,
  `Pause`.
- No highlight interaction.

### 5.4 `regions.ts` (mounts before `borders.ts`)
- **DOM:** `#regions-buttons`, `#regions-output`.
- **State:** `provinceNames: string[]`, `regionMembers: string[][]`,
  `selectedRegion: number | null`, `buttons: HTMLButtonElement[]`.
- **mount (async):** build `mapping: Uint16Array` grouping each sector by the
  province suffix of `getSector(key)?.name` (`0xffff` sentinel for unparseable),
  as in `setupRegions` (controller.ts:207–240). `await
  ctx.engine.setParentMapping(mapping, provinceNames.length)`; `await
  ctx.engine.aggregateGroups()`. Render one button per province into
  `#regions-buttons` (listeners via `ac.signal`).
- **selectRegion(groupId) — exact algorithm** (covers toggle-off AND switching
  directly from one region to another):
  1. If `selectedRegion === groupId`: call `deselectRegion()`; return.
  2. If `selectedRegion !== null`: call `deselectRegion()` first.
  3. `selectedRegion = groupId`; for each hex in `regionMembers[groupId]`:
     `ctx.highlights.set(hex, 'region', REGION_COLOR)`.
  4. Set `.active` on `buttons[groupId]`; ensure it is cleared on all others.
  5. `const [minX, minY, maxX, maxY] = ctx.engine.getGroupBBox(groupId)` → write
     `region` (name), `bbox` (`${minX},${minY} → ${maxX},${maxY}`), and `size`
     (`${maxX - minX + 1} × ${maxY - minY + 1} px`) rows into `#regions-output`
     via `makeInfoRow`, removing its `empty-state` class (port `setRegionOutput`,
     ui.ts:276–288).

  The former "don't stomp" member guard (controller.ts:255–260) is unnecessary —
  precedence handles it.
- **deselectRegion():** `ctx.highlights.clearLayer('region')`;
  `selectedRegion = null`; remove `.active` from every button; restore
  `#regions-output` to its empty-state prompt (`Select a region to see its
  bounding box`, re-adding the `empty-state` class).
- **destroy:** `ac.abort()`; `deselectRegion()`; empty `#regions-buttons`;
  reset `buttons = []`.

### 5.5 `borders.ts`
- **DOM:** `#btn-borders-show`, `#borders-output`.
- **State:** `isComputed=false`, `isVisible=false`.
- **mount:** wire `#btn-borders-show` (via `ac.signal`) to `toggle`.
- **toggle() — exact algorithm** (port of controller.ts:342–355):
  1. If `!isComputed`: `await ctx.engine.recomputeBorders()`; then
     `if (ac.signal.aborted) return` (abort-guard, §4.3); `isComputed = true`;
     `const segments = ctx.engine.getBorderSegments()`;
     `const n = segments ? segments.length / 4 : 0` → write
     `` `${n} border segment${n === 1 ? '' : 's'} drawn` `` to `#borders-output`,
     removing its `empty-state` class (ui.ts:362–365).
  2. `isVisible = !isVisible`; `ctx.engine.setBordersVisible(isVisible)`; set the
     button text to `isVisible ? 'Hide group borders' : 'Show group borders'`.

  The first click therefore computes AND shows in one gesture. Depends on
  `regions.ts` having uploaded the parentMapping (mount order).
- **destroy:** `ac.abort()`; reset button label to `Show group borders` and
  `#borders-output` to its empty-state prompt. (GPU teardown is handled by
  `engine.destroy()`.)

### 5.6 `anchors.ts`
- **DOM:** `#btn-anchors-toggle`, `#anchors-output`; markers appended into
  `#map-container`.
- **State:** `isComputed=false`, `isVisible=false`,
  `anchorEls: HTMLElement[]`, `centroidEls: HTMLElement[]`.
- **mount:** wire `#btn-anchors-toggle` to `toggle` (via `ac.signal`); register
  an `onFrame` callback that calls `reproject()` when `isVisible`.
- **reproject()** (port `updateAnchorPositions`, controller.ts:316–329): for each
  `id` in `0..ctx.sectorKeys.length`:
  `const [ax, ay] = ctx.engine.getAnchor(id)` →
  `const [sx, sy] = ctx.engine.project(ax, ay)` → set `anchorEls[id].style.left`
  / `.top` to `` `${sx}px` `` / `` `${sy}px` ``; then the same for
  `ctx.engine.getCentroid(id)` → `centroidEls[id]`.
- **toggle() — exact algorithm** (port of controller.ts:292–313):
  1. If `!isComputed`: write `Computing anchors…` to `#anchors-output`;
     `await ctx.engine.computeAnchors()`; then `if (ac.signal.aborted) return`
     (abort-guard, §4.3); `isComputed = true`; create one `div.anchor-marker` +
     one `div.centroid-marker` per sector, appended to `#map-container` and
     pushed into `anchorEls`/`centroidEls` (ui.ts:307–324); write the explainer
     text (controller.ts:304–306) to `#anchors-output`, removing its
     `empty-state` class.
  2. `isVisible = !isVisible`; set every marker's `style.display` to
     `isVisible ? '' : 'none'`; set the button text to
     `isVisible ? 'Hide anchors' : 'Show anchors'`; if now visible, call
     `reproject()` once immediately.
- **destroy:** `offFrame`; `ac.abort()`; remove all marker elements from the DOM;
  clear arrays; reset button label and `#anchors-output` to empty-state.
- Note: this is the one feature that adds elements outside its sidebar section
  (into `#map-container`); it must remove them in `destroy` (the current
  `clearAnchorMarkers`, ui.ts:327–332).

### 5.7 `map-modes.ts`
- **DOM:** `#btn-mapmode-default`, `#btn-mapmode-grayscale`.
- **State:** none (colors are local).
- **mount:** build `default` (packed hex per key) and `grayscale`
  (luminance-weighted) `Uint32Array`s from `ctx.sectorKeys`
  (`registerMapModes`, controller.ts:182–198);
  `ctx.engine.registerMapMode('default', …)`,
  `registerMapMode('grayscale', …)`, `setMapMode('default')`. Wire both buttons
  (via `ac.signal`) to `setMapMode`.
- **destroy:** `ac.abort()`. (Modes are re-registered on the fresh engine each
  reload — no explicit unregister needed.)

---

## 6. Cross-feature contracts (must preserve)

1. **id-bridge invariant.** `ctx.sectorKeys[id]` and `ctx.hexToId.get(hex)` are
   built once in `App.start` from `getSectorKeys()` (index === numeric id).
   Pathfinding and Regions convert hex↔id through them; Anchors iterates
   `0..sectorKeys.length`.
2. **Regions-before-Borders.** Borders' `recomputeBorders()` reuses the province
   parentMapping uploaded by Regions' `setParentMapping()`. Keep `createRegions`
   before `createBorders` in `FEATURES`.
3. **Read-after-await ordering.** `getGroupBBox` (after `aggregateGroups`),
   `getAnchor` (after `computeAnchors`), `getBorderSegments` (after
   `recomputeBorders`) are valid synchronously the instant the `await` resolves —
   the engine pushes the buffer before resolving. Do not add extra awaits.
4. **setTickRate before loadMap.** `App.start` calls `setTickRate(60)` before
   `loadMap` resolves (the engine throws if called after load).
5. **Frame-callback ownership.** Every feature that calls `onFrame` calls the
   matching `offFrame` in `destroy` (Selection, Frame-hook, Clock, Anchors). This
   removes the current offFrame asymmetry.
6. **Abort-guard after gesture-triggered awaits.** Pathfinding (`pick`,
   `findPath`), Borders (`recomputeBorders`), and Anchors (`computeAnchors`)
   re-check `ac.signal.aborted` immediately after each `await` and bail if set —
   a Reload may have destroyed the feature mid-flight. Load-time awaits inside
   `mount()` don't need it (the `App.isBusy` guard blocks Reload during mounts).

---

## 7. Execution order

Each step compiles green on its own. Run `npm run typecheck:example` after each.

1. **Scaffold `lib/`.** Create `colors.ts`, `highlights.ts`, `feature.ts`, and
   `dom.ts` (move the six helpers from `ui.ts:55–125` verbatim and export them;
   add `setStatus`). Additive — nothing consumes them yet; compiles.
2. **Write the ten feature modules** under `features/` (§4 full source for hover,
   selection, pathfinding; §5 specs for the rest). They import from `lib/` and
   `'map-engine'`. Still unreferenced; compiles.
3. **Write `app.ts`** (§3.1) with the full `FEATURES` registry.
4. **Rewrite `main.ts`** (§3.2) to construct `App`. Remove the `AppController`
   and `chk-hover` references.
5. **Delete `controller.ts` and `ui.ts`.** They are now unreferenced.
   `typecheck:example` must stay green.
6. **Run the full verification suite** (§8).
7. **Optional CSS polish (cosmetic).** In `index.html`, the class `clock-controls`
   is used as a generic button-row on five panels (lines 45, 69, 77, 87, 97) and
   has **no CSS rule**. Rename it to `button-row` in those five places and add
   `.button-row { display: flex; flex-wrap: wrap; gap: 0.4rem; }` to
   `style.css`. Feature-specific CSS (`.anchor-marker`/`.centroid-marker`,
   `#sector-list`/`.sector-item*`, `#status`) can stay in `style.css` as-is;
   splitting CSS per feature is out of scope. Also fix the id/variable naming: the
   Borders button id is `btn-borders-show` (keep the id; name the feature's local
   `showBtn`/`toggleBtn` clearly to avoid the old `btnBordersToggle`↔`show`
   mismatch).
8. **Docs update (§9)** — an explicit, instructed step, not automatic.

---

## 8. Verification

Per the project post-task checklist, plus the example build path:

- **Batch 1 (parallel):** `npm run typecheck` && `npm run typecheck:example`
- **Batch 2 (parallel, after Batch 1):** `npm run test` && `npm run build` &&
  `npm run build:example`
- **Then:** `npm run format`

`build:example` (`tsc && vite build` inside `example/`) exercises the production
type + bundle path, not only the dev alias — run it explicitly for an
example-only refactor.

**Manual smoke test** (`npm run example`, localhost:3000) — confirm each feature
end-to-end: hover panel + highlight; click select (pulse + neighbors + advanced
bbox/centroid); frame counter increments; clock pause/speed; right-click path
start→end and PathNotFound message; region buttons + bbox + highlight; show/hide
borders; show/hide anchors with markers tracking on pan/zoom; default/grayscale;
Reload engine (everything resets cleanly, no stuck overlays); toggle hover
checkbox off/on.

---

## 9. Documentation updates (explicit, instructed step)

`.claude/rules/example-app.md` is governed by `.claude/rules/claude-files.md`
Edit Authority — edit it only as an explicitly instructed step of this refactor,
which this section authorizes. Two sections describe structures the refactor
replaces:

- **"Module layout" (example-app.md:24–36)** — rewrite the three-file-split table
  to describe the feature-module architecture: `main.ts` (root) → `app.ts`
  (`App`: engine lifecycle + feature registry) → `lib/` (feature contract,
  highlights, colors, dom helpers) → `features/*` (one module per sidebar
  section, each a `createX(ctx): Feature` with `mount`/`destroy`). Preserve the
  still-true invariants: engine-logic vs DOM separation, one sidebar `<section>`
  per feature, import from `'map-engine'`, API-sync mandate. Update the "Keeping
  in sync" section (38–40) — the demonstrated surface now lives across
  `features/*`, indexed by the `main.ts` header comment.
- **"Overlay color precedence" (example-app.md:42–44)** — keep the precedence
  *semantics* (`selected > path > neighbor > region > hover`, restore-to-highest-
  owning-layer) but re-point "how to add a layer" from the three deleted methods
  to: add the layer name to `LAYER_ORDER` in `lib/highlights.ts` at its
  precedence position; features call `highlights.set/clear` on their own layer
  only.

Also update **CLAUDE.md** (do not edit on your own initiative — instructed step
only): the post-task checklist line "When modifying the public API: also update
`example/src/main.ts`" should point at the feature modules
(`example/src/features/*` and `main.ts`'s header index) now that `main.ts` is a
minimal root.

---

## 10. Invariants (do not break)

1. **Every currently-demonstrated public API stays demonstrated.** Full mapping —
   preserve each call site's new home:

   | API | New home |
   |---|---|
   | `new MapEngine`, `setTickRate`, `loadMap`, `getSectorKeys`, `destroy` | `app.ts` |
   | `getSector` | `sector-list.ts`, `regions.ts` |
   | `getBBox`, `getCentroid` (string), `getNeighbors` | `selection.ts` |
   | `getCentroid` (numeric), `computeAnchors`, `getAnchor`, `project` | `anchors.ts` |
   | `setSectorColor`, `resetSectorColor` | `lib/highlights.ts` (only) |
   | `on`/`off('sectorHover')` | `hover.ts` |
   | `on`/`off('sectorClick')`, `onFrame`/`offFrame` (pulse) | `selection.ts` |
   | `onFrame`/`offFrame` | also `frame-hook.ts`, `clock.ts`, `anchors.ts` |
   | `pick`, `setTraversalCosts`, `findPath`, `PathNotFoundError` | `pathfinding.ts` |
   | `setParentMapping`, `aggregateGroups`, `getGroupBBox` | `regions.ts` |
   | `recomputeBorders`, `getBorderSegments`, `setBordersVisible` | `borders.ts` |
   | `registerMapMode`, `setMapMode` | `map-modes.ts` |
   | `toHexKey` | `sector-list.ts` |
   | `SectorBitmapParser`/`SectorRegistry` advanced block | `main.ts` comment |

2. **Static assets untouched** — `public/map.png`, `public/sectors.json` are not
   regenerated, moved, or replaced.
3. **Relative asset URLs + `base: './'`** — `loadMap` keeps `'map.png'` /
   `'sectors.json'` (no leading slash); `vite.config.ts` keeps `base: './'`.
4. **Import from `'map-engine'`, never `../src`** — every module imports the
   library through the alias.
5. **DOM-safety guard** — `assertSafeHexKey()` still wraps every hex-into-`style`
   interpolation (swatches, sector-list). Keep it in `dom.ts`.
6. **No new runtime dependencies** — `HighlightLayers`, the feature contract, and
   the DOM helpers are all hand-rolled in-repo. Only `map-engine` and `three`
   remain.
7. **Teaching legibility** — each feature is one readable file traceable to one
   sidebar `<section>`; the engine's public API is more prominent, not less.
8. **Overlay precedence semantics** — hover-out restores a sector to the
   highest-priority layer still owning it (via `reconcile`), never blindly to the
   map-mode base.

---

## 11. Risks & gotchas (found in analysis)

- **Neighbor `#aaccff` (controller.ts:418, 551, 619) and hover `#e8e8d0`
  (441, 464) are repeated inline literals.** They MUST become the single
  `NEIGHBOR_COLOR` / `HOVER_COLOR` constants (§2.1), or layers desync.
- **Selected↔Advanced panel coupling** — the current `renderSelectedPanel` writes
  both `#selected-content` and `#advanced-content`. Keep both in `selection.ts`
  (done in §4.2); they cannot be split into separate features as written.
- **Static default strings in `index.html` duplicate `clear*` text** (e.g.
  pathfinding prompt line 62, regions line 71, anchors line 81, borders line 91).
  Each feature's `mount`/reset must reproduce its panel's default text so reload
  matches first load.
- **Borders button id/variable mismatch** — the id is `btn-borders-show` (not
  `…-toggle`). Query the correct id.
- **`.clock-controls` has no CSS rule** and is misnamed (used on 5 panels). Handle
  in Step 7 (optional).
- **offFrame asymmetry / failed-load skip** — the new per-feature `destroy()` +
  `App.reload` ordering fixes both; do not reintroduce a central `resetState`.
- **`getNeighbors`/`getBBox` numeric overloads** are not exercised today (only
  string forms; `getCentroid` numeric IS used in anchors). No need to add them —
  but do not remove the string-form demonstrations.
- **tsconfig traps (§1.5).** The three flags that WILL fail the build if
  forgotten: `erasableSyntaxOnly` (no constructor parameter properties — write
  explicit field + assignment), `verbatimModuleSyntax` (type-only imports need
  `import type`), `noUnusedLocals`/`noUnusedParameters` (no unused imports,
  variables, or parameters — e.g. an `onFrame` callback that ignores `dt` must
  omit the parameter entirely, as `frame-hook.ts`'s counter callback should).
- **Intentional behavior normalizations** — expected diffs from the current app;
  do NOT "fix" them back during smoke testing:
  1. Selecting a region recolors a member sector even while the pointer rests on
     it (`region` > `hover`, deterministic — §2.2).
  2. Reload resets the hover checkbox to checked (the current app re-subscribes
     while leaving the box unchecked — a bug, §4.1).
  3. Selected/Advanced skeleton rows keep `empty-state` styling uniformly
     (the current app loses the class after the first selection — §4.2).
  4. Double-clicking Reload is a no-op while a load is in flight (`App.isBusy`).
