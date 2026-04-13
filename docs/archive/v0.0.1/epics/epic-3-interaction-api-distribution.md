# Epic 3: Interaction, Public API Facade, and Distribution

**Objective:** Encapsulate internal subsystems behind the primary `MapEngine` facade, wire main-thread DOM events to spatial raycasting for zero-GPU-overhead hover/click targeting, and finalize the distribution envelope.
**Scope:** Incorporates PRD Phases 5 and 6.

**Verifiable & Measurable Success Criteria:**

- **Execution & Orchestration:** `MapEngine.loadMap()` concurrently parses the PNG and JSON definitions. Internal guard flags (`_loading`, `_loaded`, `_destroyed`) explicitly intercept and block concurrent or invalid execution calls. `engine.destroy()` safely halts the `requestAnimationFrame` loop, strips DOM listeners, and purges texture memory.
- **Event Architecture:** Implementing `on()` and `off()` allows handler binding/unbinding regardless of the engine's active or pre-load state, throwing errors only if invoked against a permanently destroyed instance.
- **Pointer Picking (Raycasting):** DOM client coordinates properly compute against `getBoundingClientRect()` to derive Normalized Device Coordinates (NDC). Raycast intersections resolve UV coordinates, reverse the Three.js bottom-left origin rule, and clamp integers to reliably feed the `getSectorAt` registry.
- **Interaction Accuracy:** Dispatching synthetic pointer events inside validated sector bounds emits `sectorHover` and `sectorClick` loaded with strict `PickResult` payloads. Dragging into an undefined margin, void color, or off-plane area guarantees a `sectorHover` event yielding `null`.
- **Bundle & Asset Governance:** Final output measures strictly `< 15 KB` gzipped. Documentation codifies explicit restrictions on PNG anti-aliasing constraints, cross-origin resource sharing (CORS) deployment warnings, and `loadMap()` partial-failure recovery semantics.

---

## Tasks

### Task 3.1 — `MapEngine` Constructor and Event Subscription System (`on` / `off`)

**PRD Reference:** Phase 5 scope (§ "Phase 5: MapEngine Facade and Pointer Picking"); §7 "MapEngine Public Facade" (constructor, `on`/`off`, event emitter implementation); Phase 5 acceptance criteria for pre-load and post-destroy subscription behavior

Implement the zero-argument constructor and the typed event subscription API. This is pure bookkeeping — no loading logic, no canvas access, no module wiring yet.

**Work:**

- Implement `MapEngine` with a **zero-argument constructor** (PRD §7 "Constructor" — canvas is provided via `loadMap()`, not the constructor):
  - Initialize lifecycle flags: `_loaded: boolean = false`, `_destroyed: boolean = false`, `_loading: boolean = false`
  - Initialize hover tracking: `_lastHexKey: string | null = null` (tracks the hex key from the most recent `sectorHover` emission for change-detection; PRD Phase 5 scope — "declared as internal state in Phase 5 scope" per Iteration 7)
  - Create `this._parser = new SectorBitmapParser()` — instantiated once, retained for the lifetime of the instance, not nulled by `destroy()` (PRD §7 — "`_parser` is not nulled by `destroy()` — it has no state to clean up"; per Iteration 8)
  - Initialize event handler map: `new Map<string, Set<Function>>()`
- Implement `on()` with the full overloaded TypeScript signatures from PRD §7:

  ```typescript
  on(event: 'sectorClick', handler: (result: PickResult) => void): void;
  on(event: 'sectorHover', handler: (result: PickResult | null) => void): void;
  ```

  - Exempt from the pre-load guard — event subscription is pure bookkeeping and does not require loaded state; consumers may subscribe before calling `loadMap()` (PRD §7 — "explicitly exempted from the pre-load guard")
  - Check `_destroyed` — if `true`, throw `new Error("MapEngine: destroyed")` (PRD §7 — "`on()` and `off()` throw 'MapEngine: destroyed' after destroy on a fully-loaded engine")
  - Add handler to the internal `Set<Function>` for the given event key; create the set if it does not yet exist

- Implement `off(event: 'sectorClick' | 'sectorHover', handler: Function): void`:
  - Same `_destroyed` check and throw as `on()`
  - Same pre-load exemption as `on()`
  - Perform `Set.delete(handler)` on the internal handler set — reference-identity deletion only
  - `off` intentionally uses a single `Function` parameter rather than overloaded typed signatures — `Set.delete` cares only about reference identity, not handler type (PRD §7 "`off` signature note" — "Do not add overloaded signatures")
- Implement a private `_emit(event: string, payload: unknown): void` helper that retrieves the handler set for the given event key and calls each handler with `payload` — this is the single call site for all event emission; Task 3.4 calls `this._emit('sectorHover', result)` and `this._emit('sectorClick', result)` rather than iterating the map inline
- Custom lightweight emitter only — do **not** extend `EventTarget` (PRD §7 "Event emitter implementation")

**Done when:** `engine.on('sectorHover', handler)` before `loadMap()` does not throw; `engine.off('sectorHover', handler)` before `loadMap()` does not throw; `engine.on(...)` after `destroy()` on a fully-loaded engine throws `"MapEngine: destroyed"`; `engine.off(...)` after `destroy()` on a fully-loaded engine throws `"MapEngine: destroyed"`; handler registered via `on()` before `loadMap()` receives events after `loadMap()` resolves.

---

### Task 3.2 — `loadMap()`, Lifecycle Guards, `destroy()`, and Pass-Through Methods

**PRD Reference:** Core Functionality §6 "Map Loading Pipeline"; §7 "`destroy()` cleanup contract"; Phase 5 acceptance criteria for all lifecycle guard behavior and partial-failure recovery; §7 "Pre-load and post-destroy guards"

Wire the full loading sequence with concurrent asset fetching, all guard checks, and the exact `destroy()` teardown contract. This task makes the engine functional end-to-end.

**Work:**

- Implement `loadMap(config: MapConfig): Promise<void>` with guard checks in this exact order (PRD §6 "Loading sequence" step 0):
  1. If `_destroyed`, throw `new Error('MapEngine: destroyed')`
  2. If `_loaded`, throw `new Error('MapEngine: already loaded — call destroy() before loading a new map')`
  3. If `_loading`, throw `new Error('MapEngine: loadMap() is already in progress')`
  4. Set `_loading = true`
  5. Run `Promise.all` in parallel (PRD §6 — "steps 1 and 2 run in parallel"):
     - `this._parser.parse(config.bitmapUrl)`
     - `fetch(config.definitionUrl).then(r => { if (!r.ok) throw new Error(\`Failed to load definition: HTTP ${r.status} ${r.statusText}\`); return r.json(); })`
  6. Construct `new SectorRegistry(buffer, width, height, definition)`
  7. Construct `new MapRenderer(config.canvas, registry)`
  8. Set `_loaded = true`, `_loading = false`; resolve
  - On any rejection: set `_loading = false` before propagating; do not set `_destroyed` (PRD §6 "On rejection")
- Store `_canvas: HTMLCanvasElement | null = null` on the instance; assign it inside `loadMap()` as `this._canvas = config.canvas` before registering picking listeners — `destroy()` needs the canvas reference to call `removeEventListener`, but the canvas is not available until `loadMap()` is called; `destroy()` must guard for null: `if (this._canvas) { this._canvas.removeEventListener(...) }` (this covers the partial-failure path where `destroy()` is called before `MapRenderer` is constructed and picking listeners are registered)
- Implement `destroy()` per the exact 7-step contract in PRD §7:
  1. If `_destroyed === true`: return immediately — idempotent, never throws
  2. If `_renderer` non-null: call `_renderer.destroy()` (disposes renderer, cancels rAF, disposes geometry/material/texture, removes `MapRenderer`-owned canvas listeners)
  3. Remove `MapEngine`-owned canvas listeners using `_canvas` reference: `pointermove` (hover picking) and `click` (click picking); guard `if (this._canvas)` before calling `removeEventListener` — the canvas is null if `loadMap()` never reached the listener-registration step
  4. Call `.clear()` on the internal event handler map
  5. Set `_registry = null`, `_renderer = null`, `_canvas = null`, `_loading = false`
  6. **If `_loaded === true`**: set `_destroyed = true` — engine is permanently unusable; all subsequent method calls throw `"MapEngine: destroyed"`
  7. **If `_loaded === false`** (partial-failure recovery path): do **not** set `_destroyed = true`; engine returns to pre-load state; `loadMap()` may be retried (PRD §7 "`destroy()` cleanup contract" steps 6–7 — this is the BLOCKER fix from Iteration 6)
- Expose `renderer` and `registry` as getters that throw `"MapEngine: not loaded — call loadMap() first"` before load and `"MapEngine: destroyed"` after destroy on a fully-loaded engine (PRD §7 "Exposed internals")
- Implement `getSector`, `setSectorColor`, `resetSectorColor` as pass-throughs to `_registry`/`_renderer` with pre-load guard (`"MapEngine: not loaded"`) and post-destroy guard (`"MapEngine: destroyed"`)

**Done when:** `loadMap()` resolves with test fixtures; double-call throws `"already loaded"`; concurrent-call throws `"already in progress"`; `loadMap()` after `destroy()` on fully-loaded engine throws `"destroyed"`; partial-failure recovery — `destroy()` then `loadMap()` again with valid inputs succeeds; `loadMap()` with a `definitionUrl` returning HTTP 200 but non-JSON body (e.g., `"not json"`) rejects with a parse `Error` (PRD Phase 5 acceptance criteria); all pass-through methods throw before load and after destroy; `destroy()` is idempotent.

---

### Task 3.3 — Picking Pipeline: NDC Conversion, Raycasting, and UV-to-Pixel Mapping

**PRD Reference:** Core Functionality §4 "Pointer Picking (Hover and Click)" (NDC conversion, UV mapping, picking algorithm steps 1–4); §"Key Architectural Decisions" #4 (CPU-side picking from in-memory buffer); Phase 5 §"Pointer coordinate derivation for test bitmap"

Implement the coordinate transformation pipeline from raw DOM pointer coordinates through NDC → raycaster → UV → clamped pixel coordinates. This is the geometry layer of picking; event emission is wired in Task 3.4.

**Listener registration timing:** The picking logic is implemented as a private method (e.g., `_handlePointerEvent(event, isClick)`) on `MapEngine`. The `pointermove` and `click` listeners that call this method are **registered inside `loadMap()`** (Task 3.2's scope), after `MapRenderer` and `SectorRegistry` are constructed and `_canvas` is assigned — because the canvas reference, mesh, camera, and registry are all required by the picking logic and are only available post-load. This task implements the picking logic itself; Task 3.2 is responsible for the `addEventListener` calls.

**Work:**

- Create a `THREE.Raycaster` instance on `MapEngine` — reused on every pointer event
- Implement the private picking method (called by both `pointermove` and `click` listeners registered in Task 3.2); both listeners coexist on the same canvas with `MapRenderer`'s `pointermove` for pan — this is intentional (PRD §7 "Listener ownership")
- For both event types, implement picking algorithm steps 1–4 from PRD §4 exactly:
  1. **NDC conversion** using `getBoundingClientRect()` (PRD §4 "NDC conversion — DOM event to raycaster input"):
     ```typescript
     const rect = canvas.getBoundingClientRect()
     const ndc = new THREE.Vector2(
       ((event.clientX - rect.left) / rect.width) * 2 - 1,
       -((event.clientY - rect.top) / rect.height) * 2 + 1
     )
     ```
     Do **not** use `event.offsetX/Y` (requires canvas to be exact event target) or `canvas.width` (includes devicePixelRatio scaling — produces wrong NDC)
  2. `raycaster.setFromCamera(ndc, camera)` → `raycaster.intersectObject(mesh)`
  3. If intersection array is **empty**: ray missed the map plane — hand off to emission layer (Task 3.4) as a miss
  4. Extract `intersection[0].uv`; apply Y-inversion and clamping (PRD §4 "UV Mapping — coordinate system inversion"):
     ```typescript
     const pixelX = Math.max(0, Math.min(width - 1, Math.floor(uv.x * width)))
     const pixelY = Math.max(
       0,
       Math.min(height - 1, Math.floor((1 - uv.y) * height))
     )
     ```
     The clamp formula guarantees `pixelX` and `pixelY` are always within bounds regardless of floating-point edge cases (e.g., `uv.x === 1.0` → `Math.floor(1.0 * width) = width` → `Math.min(width-1, width) = width-1` — safe); no try-catch needed around `getSectorAt` (PRD §4 "UV-to-pixel clamp guarantee")
- The private picking method accesses `this._mesh`, `this._camera`, `this._registry` — these are set during `loadMap()` after construction of `MapRenderer` and `SectorRegistry`; the listeners registered in Task 3.2 call this method, which is safe because listeners are only registered after these references are populated

**Done when:** NDC conversion produces correct values for known canvas pixel coordinates — for the 800×600 test canvas under "contain" framing, canvas pixel (250, 150) (red quadrant center) produces NDC approximately `(-0.375, 0.5)` and intersects the mesh; canvas pixel (50, 300) (left margin, off-plane) produces an empty intersection array.

---

### Task 3.4 — Sector Resolution, `PickResult` Construction, and Event Emission

**PRD Reference:** Core Functionality §4 "Pointer Picking" (picking algorithm steps 5–8); §4 "Outputs" (`sectorHover`, `sectorClick`, null emission); Phase 5 acceptance criteria for all picking behavior including mismatch fixture test; §"Key Architectural Decisions" #4 (two-step lookup)

Complete the picking algorithm with the two-step `getSectorAt`→`getSector` lookup, `PickResult` construction, change-detection for `sectorHover`, and unconditional `sectorClick` emission. Write the full picking test suite.

**Work:**

- Continue from the clamped `pixelX`/`pixelY` produced in Task 3.3; implement algorithm steps 5–8 from PRD §4 exactly: 5. `registry.getSectorAt(pixelX, pixelY)` → hex key (O(1) source buffer read) 6. `registry.getSector(hexKey)` → `SectorData | undefined` 7. If `getSector` returns `undefined` (bitmap-only color, anti-aliased artifact, any pixel with no JSON definition): treat as a **miss** — same handling as an empty intersection; do not construct `PickResult`; do not emit `sectorClick`; for `sectorHover`: if `_lastHexKey !== null`, emit `sectorHover` with `null` and set `_lastHexKey = null`; otherwise no-op (PRD §4 step 7 — "A sector resolves means `getSector(hexKey)` returned non-`undefined`") 8. If `getSector` returns defined `SectorData`: construct `PickResult { hexKey, sectorData, pixelX, pixelY }`
  - **`sectorHover`**: compare `hexKey` to `_lastHexKey` — emit only if different; update `_lastHexKey = hexKey` (change-detection prevents flooding on continuous pointer move within same sector)
  - **`sectorClick`**: emit unconditionally with the `PickResult`
- Miss handling (steps 3 and 7 above): for `sectorHover`, emit `null` and reset `_lastHexKey = null` only if `_lastHexKey !== null` — avoids redundant null emissions when pointer stays off-plane
- Emit events by iterating the internal `Map<string, Set<Function>>` handler set for the event key; call each handler with the payload
- Remove both `pointermove` and `click` listeners during `destroy()` — these are `MapEngine`-owned and must be cleaned up separately from `MapRenderer`-owned listeners (PRD §7 "Listener ownership")
- Write browser-mode tests using the test canvas setup preamble and absolute fixture URLs (PRD §"Test Canvas Setup"; §"Test Fixture URLs"); use `clientX = rect.left + canvasPixelX` for synthetic events (PRD Phase 5 §"Synthetic pointer event construction note"):
  - `pointermove` at (250, 150) → `sectorHover` with `hexKey === 'ff0000'`, `sectorData.name === 'Red Sector'`
  - Second `pointermove` at (250, 150) → no second `sectorHover` emission
  - `pointermove` from (250, 150) to (550, 150) → exactly one `sectorHover` with `hexKey === '00ff00'`
  - `pointermove` at (50, 300) (left margin, off-plane) → `sectorHover` with `null`
  - `click` at (250, 150) → `sectorClick` with `hexKey === 'ff0000'`; `result.pixelX` in `[0,1]`, `result.pixelY` in `[0,1]`
  - `pointermove` at (250, 450) (blue quadrant center — bottom-left) → `sectorHover` with `hexKey === '0000ff'`; this test is specifically required to validate Y-axis inversion correctness: if the `(1 - uv.y)` inversion is missing, red and blue quadrants swap and this assertion fails (PRD §4 "UV Mapping — coordinate system inversion")
  - `click` at (50, 300) (off-plane) → no `sectorClick` emission
  - Mismatch fixture: load with `test-4x4-mismatch.json`; `pointermove` at (550, 450) (yellow quadrant — `"ffff00"` has no JSON entry) → `sectorHover` emits `null` because `getSector("ffff00") === undefined` (PRD Phase 5 — "mismatch fixture picking test"; per Iteration 8 Issue 12)
  - After `engine.destroy()`: `pointermove` on canvas does not invoke `sectorHover` callback

**Done when:** All Phase 5 picking acceptance criteria pass; change-detection prevents duplicate hover events; mismatch fixture correctly emits `null` for bitmap-only colors; destroy fully removes listeners.

---

### Task 3.5 — Core API Documentation: Quickstart, API Reference, and Asset Contracts

**PRD Reference:** Phase 6 scope (§ "Phase 6: Documentation, Asset Contract, and Size Verification"); Phase 6 acceptance criteria items 1–10

Write the consumer-facing documentation covering everything needed to integrate and use the library correctly. No new implementation code.

**Work:**

- **Quickstart**: complete copy-pasteable HTML + TypeScript example that: (a) imports `MapEngine`, (b) calls `loadMap()` with bitmap URL, definition URL, and canvas, (c) subscribes to `sectorHover` and logs results to the console, (d) references no file or API not documented in the README — syntactically valid TypeScript (PRD Phase 6 acceptance criteria #1)
- **Sector bitmap contract**: explicit list of every constraint on `sectors.png` — no anti-aliasing, no color blending at region edges, no transparency, unique RGB per sector, solid fills only; recommended tooling (Aseprite indexed-color mode, GIMP snap-to-grid); consequences of violations (anti-aliased edge pixels produce bitmap-only colors that `getSector()` returns `undefined` for, causing null hover events at sector borders); interpretation of validation warnings (PRD Phase 6 scope §"Sector bitmap contract")
- **`sectors.json` format reference**:
  - Key format: 6-character lowercase zero-padded hex string
  - Zero-padding rule with correct (`"004d99"`) and incorrect (`"04d99"`) examples (PRD Phase 6 acceptance criteria)
  - Keys are **not normalized** — `"FF0000"` will not match bitmap hex key `"ff0000"`; correct casing is the consumer's responsibility (PRD §2 "JSON key normalization")
  - Runtime shape validation is **not performed** — malformed values produce `SectorData` with `undefined` fields (PRD §2 "Runtime shape validation")
  - `getSectorKeys()` as the canonical way to enumerate all sectors; zero-pixel (JSON-only) sectors are included; bitmap-only colors are not; include a concrete example use case — e.g., iterating all sectors to build a legend UI: `engine.getSectorKeys().forEach(key => { const data = engine.getSector(key); console.log(key, data?.name) })` (PRD Phase 6 acceptance criteria #7 — "documented with an example use case")
- **Public API reference**: all methods with parameter types, return types, and error conditions; explicit notes:
  - `destroy()` never throws; second call is silent no-op
  - `on()` and `off()` work before `loadMap()` — exempt from pre-load guard
  - `loadMap()` post-rejection retry requires calling `destroy()` first; partial-failure recovery does not permanently destroy the engine
  - `MapEngine` constructor takes no arguments
  - `sectorHover` handler signature is `(result: PickResult | null) => void`; `null` means pointer left the map or landed on an unregistered color (PRD §7 "Public API")
- **CORS deployment note**: bitmap assets on a different origin require the server to send `Access-Control-Allow-Origin` headers; `fetch()` handles CORS by default but server cooperation is required; `getImageData()` on a tainted canvas may throw `SecurityError` in some browsers — operational deployment concern, not an engine bug (PRD §1 "CORS / tainted-canvas deployment note")
- **`borderEdges` usage**: `@experimental` status visible; direction label semantics clarification — `'h'` means horizontal scan (right neighbor), which produces a vertical boundary line; `'v'` means vertical scan (bottom neighbor), which produces a horizontal boundary line; counter-intuitive vs. geometric convention but internally consistent; bitmap-only colors participate in border edge detection; engine does not consume it internally (PRD §9)
- **Void-color optimization advisory**: consumers should leave non-interactive regions (oceans, borders, wastelands) undefined in the JSON definition; undefined bitmap colors skip all spatial data structure construction — performance benefit proportional to non-interactive pixel coverage; `#000000` is the conventional void color (PRD §"Data Formats — sectors.png" void advisory)

**Done when:** All Phase 6 documentation acceptance criteria items 1–10 pass — quickstart is syntactically valid TypeScript; bitmap constraints listed explicitly; hex key zero-padding documented with correct/incorrect examples; JSON case-sensitivity documented; `sectorHover` null case documented; `@experimental` borderEdges note visible with direction label semantics; CORS deployment note present; void-color advisory present.

---

### Task 3.6 — Known Limitations, Web Worker Opt-In, Out-of-Scope List, and Bundle Size Verification

**PRD Reference:** Phase 6 scope continued (§"Phase 6" known limitations, upgrade paths, Web Worker opt-in, out-of-scope); §"Bundle Size Targets"; §"What v0.0.1 Explicitly Does Not Include"; PRD "Known Risks" items 2, 3, 9; Phase 6 acceptance criteria items 11–15

Complete the documentation with all operational risks and constraints, document the Web Worker opt-in path, enumerate v0.0.1 out-of-scope items, and verify the final gzipped bundle meets the 15 KB target.

**Work:**

- **Known limitations section** — document all of the following (PRD Phase 6 scope §"Known limitations"; PRD "Known Risks"):
  - Memory: three buffer copies in steady state (sourceBuffer ~134 MB + displayImageData ~134 MB + pixelIndices Uint32Arrays ~134 MB + GPU copy + Map/object overhead) — realistic total 400–500 MB for an 8192×4096 map (PRD Changelog: Final Release Candidate Item 6)
  - `setSectorColor` triggers full `texImage2D` re-upload (not `texSubImage2D` partial update) on every call regardless of dirty-rect size; v0.1.0 shader-based upgrade path eliminates this (PRD §3 "`texture.needsUpdate = true` — WebGL upload cost"; Changelog: Final Release Candidate Item 2)
  - `gl.MAX_TEXTURE_SIZE` hardware cap — commonly 4096 on mobile; bitmaps exceeding the device limit throw a fatal `INVALID_VALUE` WebGL error; engine does not query this limit in v0.0.1 (PRD Changelog: Final Release Candidate Item 3)
  - O(W×H) synchronous scan pass may block the main thread 200–500 ms for an 8192×4096 bitmap; Web Worker offloading is the documented v0.1.0 path (PRD Changelog: Final Release Candidate Item 9)
  - Canvas resize after construction not handled in v0.0.1
  - Continuous `requestAnimationFrame` render loop — render-on-demand deferred to v0.1.0
  - `sectorHover` fires during active pan drag — suppression deferred to v0.1.0
  - Single map instance assumption
- **Web Worker opt-in**: document how to use `SectorBitmapParser` and `SectorRegistry` inside a Worker — both modules have zero DOM global references by design; include a minimal code example showing `new Worker(...)`, `parse()` inside the worker, and `postMessage` of the buffer back to the main thread (PRD Phase 6 scope §"Web Worker opt-in"; §"Runtime Environment" — Worker integration is deferred to v0.1.0 but the modules are Worker-compatible by design)
- **UV Y-axis inversion note**: document the `pixelY = Math.floor((1 - uv.y) * height)` formula for consumers building their own overlay systems on top of the engine (PRD Phase 6 scope §"UV coordinate inversion note")
- **Out-of-scope for v0.0.1**: explicit list drawn from PRD §"What v0.0.1 Explicitly Does Not Include" — adjacency graph, area/region hierarchy, river/heightmap rendering, shader political overlay, CSV parsing, UI controls/tooltips, SSR/Node.js, multiple simultaneous instances, touch events, canvas resize handling, render-on-demand, UMD/CJS bundles, React/framework dependency, pre-fetched `ArrayBuffer`/`ImageBitmap` inputs, `gl.MAX_TEXTURE_SIZE` querying, Web Worker wiring
- **Upgrade path notes**: adjacency graph, river layer, heightmap, shader overlay (eliminates `texImage2D` cost), render-on-demand, hover suppression during drag, Web Worker scan pass offloading, `texSubImage2D` partial texture updates, `gl.MAX_TEXTURE_SIZE` query + texture tiling — each with a brief rationale for deferral
- **Bundle size verification**: run `npm run size` after a clean `vite build`; confirm `dist/index.js` gzipped is `< 15 KB` excluding Three.js; if size far exceeds target, first check `rollupOptions.external: ['three']` in `vite.config.ts` — omitting it bundles ~600 KB of Three.js and silently fails the check (PRD §"Bundle Size Targets")

**Done when:** All Phase 6 acceptance criteria items 11–15 pass — known limitations section covers all four PRD-specified risks (memory totals, `texImage2D` re-upload, `gl.MAX_TEXTURE_SIZE` crash risk, main-thread scan blocking); Web Worker opt-in documented with code example; UV Y-axis inversion formula documented; out-of-scope list present; `npm run size` reports `< 15 KB`.
