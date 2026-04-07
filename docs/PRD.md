# PRD: Browser-Native Paradox-Style Map Engine (v1)

> **Status:** Draft v2.0 — post-review revision
> **Audience:** Implementation engineers, AI coding agents
> **Research Sources:** [The Complete Paradox Map Creation Pipeline: Technical Specification for Clausewitz and Jomini Engine Modding](research/browser-native-map-engineering.pdf), [Browser-Native Grand Strategy Map Engineering: Architecture, Limitations, and Edge-Cases in RGB Index-Map Rendering](research/paradox-map-creation-pipeline.pdf)
> **Changelog v2.0:** Applied 9 items from post-v1.9 scaling review (zero code changes — all items are annotations, risk disclosures, and rationale additions). (Item 1) `createImageBitmap` premultiplication and color-space-conversion risk named in §1 and Known Risks: passing no `ImageBitmapOptions` allows browsers to silently premultiply alpha and convert color space, corrupting sector RGB IDs; no code change required for v1 because the bitmap contract guarantees opaque pixels (alpha = 255), but the failure mode is documented. (Item 2) `texture.needsUpdate = true` triggers `texImage2D` (full VRAM reallocation, not `texSubImage2D` partial update) documented in Known Risks; the dirty-rect `putImageData` optimization reduces Canvas 2D write cost only — it does not reduce WebGL upload cost; v2 shader-based upgrade path eliminates this entirely. (Item 3) `gl.MAX_TEXTURE_SIZE` mobile hardware cap (commonly 4096) added to Known Risks: attempting to instantiate a larger texture throws a fatal `INVALID_VALUE` WebGL error; the engine does not query this limit or implement texture tiling in v1. (Item 4) `NearestFilter` / `generateMipmaps = false` justification strengthened in Phase 4 scope and §3 CanvasTexture spec: two independent reasons stated — (a) picking correctness and (b) rendering correctness (interpolation creates phantom RGB values at sector borders that do not exist in the registry). (Item 5) CORS / tainted-canvas deployment risk documented in §1 and Known Risks: when the bitmap URL is hosted on a different origin, `getImageData()` on the resulting canvas may throw `SecurityError` unless the server sends `Access-Control-Allow-Origin` headers; standard `fetch` CORS semantics apply; no special CORS handling in the engine. (Item 6) Memory pressure model revised in Known Risks: realistic total for an 8192×4096 map is 400–500 MB (sourceBuffer ~134 MB + displayImageData ~134 MB + pixelIndices Uint32Arrays ~134 MB + GPU copy + Map/object overhead), not the previously stated ~150 MB. (Item 7) RGBA format decision added to Key Architectural Decisions: the engine uses RGBA (4 bytes/pixel) throughout despite alpha being semantically unused, because 32-bit aligned memory access is hardware-optimal; using RGB triggers driver-level padding to RGBA with a CPU-side repacking penalty. (Item 8) Void-color optimization advisory added to Data Formats: consumers should avoid defining non-interactive regions (oceans, wastelands) in the JSON file; undefined bitmap colors are skipped during spatial data structure construction, providing an implicit performance benefit proportional to non-interactive pixel coverage; `#000000` is the conventional void color. (Item 9) Main-thread scan pass blocking risk added to Known Risks: the O(W×H) scan during `SectorRegistry` construction runs synchronously on the main thread; for an 8192×4096 bitmap (~33.5 million pixels) this may block the UI for 200–500 ms; Web Worker offloading is the documented v2 path and is already architecturally enabled by `SectorBitmapParser`'s and `SectorRegistry`'s zero DOM-dependency constraint.
> **Changelog v1.9:** Applied 5 issues from v1.8 pre-build review. Vite library mode build configuration specified in a unified `vite.config.ts` block including `rollupOptions.external: ['three']` to prevent bundling the peer dependency; note added to Bundle Size Targets explaining the `external` directive (Issue 1, MAJOR; Issue 5, MAJOR — both resolved by one config block). Dev dependency versions pinned: `vitest` and `@vitest/browser` at `^2.1.0` (required for `instances` config syntax), `playwright` at `^1.40.0` (Issue 2, MINOR). Phase 5 acceptance criterion "pointermove events are not fired after destroy" reworded to clarify that it tests callback non-invocation, not DOM event suppression (Issue 3, MINOR). Phase 2 blob-path acceptance criterion now specifies how to create the Blob in browser mode via `fetch().then(r => r.blob())` (Issue 4, MINOR).
> **Changelog v1.8:** Applied 14 issues from v1.7 pre-build review. `MapEngine` constructor signature specified: zero-argument, canvas provided via `loadMap()` (Issue 1, MAJOR). `on()` and `off()` explicitly exempted from the pre-load guard — event subscription is pure bookkeeping on an internal `Map` and does not require loaded state; §7 blanket statement updated; acceptance criteria added to Phase 5 (Issue 2, MAJOR). Dev dependencies table added; minimum viable `vite.config.ts` browser-mode block specified with required packages `vitest`, `@vitest/browser`, `playwright` (Issue 3, MAJOR). Test fixture URL pattern for Vitest browser mode specified: absolute paths relative to project root (e.g., `'/test/fixtures/test-4x4.png'`) (Issue 4, MAJOR). Off-plane pointer test coordinates specified: canvas pixel `(50, 300)` falls in the horizontal margin outside the mesh (Issue 5, MAJOR). Test canvas setup note added: create, style, append to DOM, teardown — ensures `clientWidth`/`clientHeight` non-zero and `getBoundingClientRect()` valid (Issue 6, MAJOR). `toHexKey` usage claim reworded: `MapEngine` consumes it indirectly via `registry.getSectorAt()`, not directly (Issue 7, MINOR). `_parser` instantiation timing clarified: constructed once in the `MapEngine` constructor, retained for lifetime, not nulled by `destroy()` (Issue 8, MINOR). `_animFrameId: number` storage specified on `MapRenderer` for `cancelAnimationFrame` in `destroy()` (Issue 9, MINOR). Phase 1 acceptance criterion for "48 bytes" reworded to distinguish raw RGB input (48 bytes) from decoded RGBA output (64 bytes) (Issue 10, MINOR). Runtime shape validation of `SectorDefinitionFile` explicitly documented as not performed in v1 (Issue 11, MINOR). Phase 5 acceptance criterion added for picking with mismatch fixture: `pointermove` over bitmap-only color emits `sectorHover` with `null` (Issue 12, MAJOR). Canvas sizing contract clarified: manual `canvas.width`/`canvas.height` assignment removed; `renderer.setSize(clientWidth, clientHeight, false)` used to prevent style override (Issue 13, MINOR). Phase 3 dependency on Phase 2 noted as unnecessary: tests may construct buffer directly (Issue 14, MINOR).
> **Changelog v1.7:** Applied 3 issues from v1.6 pre-build review. Pan Y-axis acceptance criterion corrected: downward drag increases `camera.position.y` (camera moves up in world space, map follows cursor down); inline comment on pan Y formula corrected (NEW Issue 1, BLOCKER). Concurrent `loadMap()` guard added: `_loading` flag prevents a second `loadMap()` call while a previous call is in-flight; `destroy()` resets `_loading`; acceptance criterion added (NEW Issue 2, MAJOR). `_lastHexKey: string | null = null` explicitly declared as internal state in Phase 5 scope (NEW Issue 3, MINOR).
> **Changelog v1.6:** Applied 18 issues from v1.5 pre-build review. Picking pipeline now has an explicit two-step algorithm: `getSectorAt` → `getSector`; if `getSector` returns `undefined`, treat as miss — do not emit event (Issue 1, MAJOR; Issue 16, duplicate). `displayImageData` construction via `.slice()` documented as mandatory with acceptance criterion verifying source buffer immutability (Issue 2, MAJOR). Pan test acceptance criteria now assert direction (rightward drag decreases `camera.position.x`) and add Y-axis pan test (Issue 3, MAJOR). Zoom-out acceptance criterion added: `deltaY: +100` → zoom decreased (Issue 4, MINOR). Listener ownership subsection added to §7: `MapRenderer` owns pan/zoom listeners; `MapEngine` owns pick listeners; both `pointermove` listeners coexist intentionally (Issue 5, MAJOR). UV-to-pixel clamp guarantee noted: no try-catch required around `getSectorAt` in picking path (Issue 6, MINOR). `borderEdges.length === 8` total count assertion added to Phase 3 acceptance criteria (Issue 7, MAJOR). `test-4x4-mismatch.json` description reworded for clarity (Issue 8, MINOR). Texture disposal (`texture.dispose()`) added to `MapRenderer.destroy()` and §7 destroy contract (Issue 9, MAJOR). `off()` signature documented as intentionally using `Function` (Issue 10, MINOR). Phase 5 acceptance criteria added for `engine.setSectorColor`/`engine.resetSectorColor` pass-throughs including pre-load and post-destroy guards (Issue 11, MAJOR). BLOCKER resolved: `destroy()` on a never-fully-loaded engine resets to pre-load state without setting `_destroyed = true`, allowing `loadMap()` retry; acceptance criterion added (Issue 12, BLOCKER). PlaneGeometry UV origin convention acceptance criterion added to Phase 4 (Issue 13, MINOR). `npm run size` measurement method specified: single full-library target only; split "parsing + registry" target dropped (Issue 14, MAJOR). Phase 3 acceptance criterion added for `borderEdges` involving bitmap-only colors using mismatch fixture (Issue 15, MAJOR). Phase 4 dependency note: Phase 2 not required; tests may construct buffer directly (Issue 17, MINOR). JSON key normalization explicitly not performed; consumer responsibility documented (Issue 18, MINOR).
> **Changelog v1.5:** Applied 6 issues from v1.4 pre-build review. Scan pass steps 3–5 (bboxes, centroids, pixelIndices) now explicitly gated: only executed for pixels whose hex key exists in the JSON definition; bitmap-only colors are scanned for border-edge detection only (Issue 1, MAJOR). `renderer.displayCtx` exposed as readonly `OffscreenCanvasRenderingContext2D` on `MapRenderer` for test access to the display canvas context (Issue 2, MAJOR). Phase 5 synthetic pointer event note added: `clientX = rect.left + canvasPixelX` to account for canvas viewport offset (Issue 3, MINOR). Wheel handler specified to call `event.preventDefault()` with `{ passive: false }` listener registration (Issue 4, MINOR). Pan drag fully specified: `pointerup` added as required event; `_isDragging` and `_lastPointerPos` internal state documented; hover-during-drag behavior noted (Issue 5, MINOR). `loadMap()` partial-failure edge case documented: call `destroy()` before retrying if `loadMap()` rejects after assets resolve (Issue 6, MINOR).

---

## PROJECT OVERVIEW

### What This Is

A lightweight, browser-native TypeScript library that provides foundational plumbing for rendering and interacting with Paradox-style grand strategy maps on the web. It is a thin engine layer — not a game, not a UI framework, not a full application.

The conceptual lineage is the Paradox Interactive Clausewitz/Jomini engine pipeline (EU4, HOI4, CK3, Vic3), which uses a 24-bit RGB-coded province bitmap as the single source of spatial truth, linked to structured data files via color-as-identifier. This project ports the core fundamentals of that approach to the open web using browser-native APIs and Three.js only.

**The library does three things:**

1. Ingests a specially prepared PNG bitmap (every pixel belongs to exactly one uniquely-colored spatial region, called a **sector**)
2. Builds an in-memory spatial lookup structure (the `SectorRegistry`)
3. Renders the map via Three.js and emits typed interaction events (click, hover) that resolve to sector identities and their associated data

### Who It Is For

- **Primary:** The library author (personal/portfolio infrastructure project)
- **Secondary:** TypeScript/JavaScript developers building browser-based grand strategy or 4X games, interactive geopolitical or historical map visualizations, data-driven choropleth or region-selection UIs, or any application requiring a clickable, color-programmable segmented map

The API consumer is always a **developer**. The library has no end-user-facing UI of its own.

### What v1 Includes

| Module                | Description                                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `SectorBitmapParser`  | Loads a PNG URL or Blob; returns raw pixel buffer + dimensions                   |
| `SectorRegistry`      | Builds hex-key → SectorData map from pixel buffer + JSON definition              |
| `MapRenderer`         | Three.js scene: PlaneGeometry + CanvasTexture, pan/zoom camera, `setSectorColor` |
| `MapEngine`           | Public facade wiring all modules; the primary consumer-facing API                |
| `types.ts`            | All shared public TypeScript types                                               |
| `sectors.json` format | Canonical definition file format, documented and stable for v1                   |
| Load-time validation  | Warns (does not throw) on mismatches between JSON and bitmap                     |
| Test fixtures         | Minimal hand-crafted bitmap + JSON for automated testing                         |

### What v1 Explicitly Does Not Include

The following are **out of scope** and must not be implemented in v1, even partially:

- Administrative hierarchy (area/region/superregion groupings)
- Adjacency graph / neighbor queries
- `getSectorsInRegion(x, y, w, h)` bounding-box query utility — user-land
- River rendering
- Heightmap / terrain mesh (geometry is flat)
- Seasonal colormap overlays or DDS/texture atlas support
- Custom GPU shader for political overlay (CanvasTexture repaint is the v1 strategy)
- CSV parsing (JSON only)
- Any built-in UI controls, overlays, tooltips, or legend rendering
- Server-side rendering or Node.js compatibility
- Multiple simultaneous map instances
- Procedural sector map generation
- Terrain type, climate, or any semantic layer beyond user-provided JSON fields
- UMD or CJS bundles (ESM only)
- React, React Three Fiber, or any UI framework dependency
- Pre-fetched `ArrayBuffer` or `ImageBitmap` as `loadMap()` inputs — URL strings and `Blob` only in v1
- Render-on-demand / dirty-flag optimization — the v1 render loop runs continuously via `requestAnimationFrame`; this is accepted for v1 and deferred to v2
- Touch event support for pan/zoom
- Canvas resize handling after construction
- Suppressing hover events during active pan drag — deferred to v2
- Querying `gl.MAX_TEXTURE_SIZE` or implementing texture tiling / chunking — out of scope for v1 (see Known Risks)
- `createImageBitmap` options (`premultiplyAlpha`, `colorSpaceConversion`) — no options passed in v1; safe because the bitmap contract guarantees opaque pixels (see §1 and Known Risks)
- Web Worker offloading of the scan pass — `SectorBitmapParser` and `SectorRegistry` are Worker-compatible by design but Worker integration is deferred to v2 (see Phase 6 and Known Risks)

---

## CORE FUNCTIONALITY

### 1. Sector Bitmap Parsing — REQUIRED

**Description:** Load a PNG asset from a URL string or `Blob`, decode it using `createImageBitmap()`, draw it to an `OffscreenCanvas`, and extract the raw pixel buffer via `getImageData()`. Must be callable inside a Web Worker (no DOM access required).

**Class structure:** `SectorBitmapParser` is a class with a single instance method `parse()`. `MapEngine` instantiates it internally in its constructor: `this._parser = new SectorBitmapParser()`. Do not implement it as a static class or module-level function.

**Inputs:**

- `source: string | Blob` — a URL string or `Blob` pointing to a 24-bit RGB PNG bitmap where every pixel's RGB value encodes a unique sector identity. No anti-aliasing, no transparency, no color blending at region edges.

**Runtime type check:** Use `typeof source === 'string'` to distinguish string from Blob at runtime. If `source` is neither a string nor a `Blob` at runtime (a condition that TypeScript prevents at compile time but which is possible in untyped callers), throw `new Error('SectorBitmapParser.parse: source must be a string URL or Blob')`.

**String-input fetch path:**

```typescript
// When source is a string:
const response = await fetch(source)
if (!response.ok) {
  throw new Error(
    `SectorBitmapParser: failed to load bitmap — HTTP ${response.status} ${response.statusText}`
  )
}
const blob = await response.blob()
const bitmap = await createImageBitmap(blob)
```

This `r.ok` check ensures that a reachable server returning a non-2xx status (e.g., a 404 returning an HTML error page) produces a descriptive error rather than a confusing `createImageBitmap` decode failure.

**Blob-input path:** `createImageBitmap(source)` directly — no fetch roundtrip.

**`createImageBitmap` options — premultiplication risk (v1 does not pass options):**
Both call sites above invoke `createImageBitmap` without `ImageBitmapOptions`. This is safe **only** because the bitmap contract guarantees opaque pixels (alpha = 255 for all pixels in a valid input). When alpha is 255, premultiplying RGB against alpha is a no-op (`R * 1.0 = R`), so the default browser behavior cannot corrupt sector IDs.

If the engine ever relaxes this guarantee and accepts bitmaps with non-255 alpha pixels, `createImageBitmap` must be called with `{ premultiplyAlpha: 'none', colorSpaceConversion: 'none' }` at both call sites. Without these options, browsers silently premultiply RGB values against alpha before the bitmap is drawn to the canvas, irreversibly corrupting the RGB sector IDs before they reach `getImageData()`. This is a data-integrity issue, not a performance one — the corruption is silent and produces wrong hex keys with no error. **Do not add these options in v1; document the constraint instead.**

**CORS / tainted-canvas deployment note:**
When `source` is a string URL hosted on a **different origin** from the application (which is typical in production CDN deployments), standard browser CORS restrictions apply. `fetch()` issues a CORS request by default, so the server must respond with a valid `Access-Control-Allow-Origin` header. If CORS fails, `fetch()` itself will reject before `createImageBitmap` is reached. In some browser configurations, a successful `fetch()` followed by `createImageBitmap()` on a cross-origin blob, then `getImageData()` on the resulting canvas, may still throw a `SecurityError` ("tainted canvas") — the interaction between these APIs is browser-specific and not fully standardized.

This is an **operational deployment concern, not an engine bug**. The engine does not add special CORS headers to `fetch()` requests — standard `fetch` semantics apply. Consumers deploying bitmap assets on a CDN or different origin must ensure the asset server sends appropriate `Access-Control-Allow-Origin` headers. Document this in the README's deployment section (Phase 6).

**Outputs:**

- `buffer: Uint8ClampedArray` — flat RGBA pixel buffer, 4 bytes per pixel (`[R, G, B, A, R, G, B, A, …]`). The alpha byte is always 255 for valid input.
- `width: number` — bitmap width in pixels
- `height: number` — bitmap height in pixels

**Edge Cases:**

- URL returns non-2xx HTTP status: reject with descriptive `Error` containing the status code (from the `r.ok` check above)
- Non-PNG or malformed image: reject the loading `Promise` with a descriptive `Error`
- Zero-dimension image: reject with a descriptive `Error`
- Images with alpha channel: accepted; alpha byte is ignored during sector resolution; this behavior is documented
- Anti-aliased or blended edge pixels: cannot be corrected by the engine; flagged during registry construction (see §8)

---

### 2. Sector Registry Construction — REQUIRED

**Description:** Accepts the raw pixel buffer, bitmap dimensions, and parsed `SectorDefinitionFile` JSON. Performs a single O(W×H) scan of the pixel buffer to build all derived spatial data. The registry is **immutable after construction** — no public method mutates internal state.

**Inputs:**

- `buffer: Uint8ClampedArray`, `width: number`, `height: number` — from `SectorBitmapParser`
- `definition: SectorDefinitionFile` — parsed definition object (see Data Formats)

**JSON key normalization:** JSON keys are **not** normalized or validated for format. A key like `"FF0000"` (uppercase) will fail to match bitmap hex key `"ff0000"` (lowercase) and will be treated as a zero-pixel definition sector. This is the consumer's responsibility. The engine does not normalize case.

**Runtime shape validation:** Runtime shape validation of `SectorDefinitionFile` values is not performed in v1. The engine trusts the consumer to provide conforming JSON. Malformed values (e.g., missing `name` field) will produce `SectorData` objects with `undefined` fields. This is accepted for v1.

**Internal state (all retained after construction, exposed as readonly):**

- `sourceBuffer: Uint8ClampedArray` — the original pixel buffer retained as a readonly reference; required by `MapRenderer` for display canvas initialization and `resetSectorColor`
- `width: number`, `height: number` — bitmap dimensions
- `Map<hexKey, SectorData>` — populated from the JSON definition during the scan pass; not directly exposed; accessed via `getSector()` and `getSectorKeys()`. **Bitmap colors with no JSON definition entry are not inserted into this map.**
- `bboxes: Map<string, SectorBBox>` — per-sector bounding box (minX, minY, maxX, maxY); only contains entries for definition-registered sectors
- `centroids: Map<string, { x: number; y: number }>` — per-sector arithmetic centroid in pixel space (mean of all pixel X/Y coordinates belonging to that sector). Note: for highly non-convex or multi-piece sector shapes, the arithmetic centroid may fall outside the sector's own pixels. This is accepted and documented for v1. Only contains entries for definition-registered sectors.
- `pixelIndices: Map<string, Uint32Array>` — per-sector sorted array of flat pixel indices (`y * width + x`); consumed by `MapRenderer.setSectorColor` to patch only the relevant pixels without a full-buffer scan. Only contains entries for definition-registered sectors.
- `borderEdges: BorderEdge[]` — pixel-boundary transitions between adjacent sectors; `@experimental`; not consumed by the engine (see §9). Border edges are recorded for all pixel pairs regardless of definition membership.

**Public methods:**

- `getSectorAt(pixelX: number, pixelY: number): string` — reads `R`, `G`, `B` from `sourceBuffer` at index `(pixelY * width + pixelX) * 4`, constructs and returns the hex key using `toHexKey()`. O(1). If `pixelX < 0`, `pixelX >= width`, `pixelY < 0`, or `pixelY >= height`, throw `new Error('getSectorAt: coordinates out of bounds')`. Non-integer inputs are floored before the bounds check.
- `getSector(hexKey: string): SectorData | undefined` — map lookup. O(1).
- `getSectorKeys(): string[]` — returns an array of all hex key strings present in the sector map (both keys with pixels and keys with zero pixels from the JSON definition). Enables consumers to enumerate all sectors without a direct reference to the internal `Map`. O(n) where n is the number of sectors. **Bitmap colors with no JSON definition entry are not included** — they are flagged by load-time validation but are not registered sectors.

**Edge Cases:**

- Pixel buffer length inconsistent with `width * height * 4`: throw with a descriptive `Error`
- A hex key present in `definition` but with zero matching pixels in the bitmap: emit `console.warn`; the key **remains** in the sector map so `getSector()` returns its data and `getSectorKeys()` includes it; exclude from `bboxes`, `centroids`, and `pixelIndices`
- A pixel color present in the bitmap but with no matching `definition` entry: emit `console.warn`; `getSector()` returns `undefined` for that key; the key is **not** inserted into the sector map and is **not** returned by `getSectorKeys()`; the color **is** included in border edge detection

**Constraint:** `SectorRegistry` must have **zero imports** from Three.js or any rendering library. Enforced at the module level; verifiable by static analysis.

---

### 3. Sector Color Overlay — REQUIRED

**Description:** Repaints all pixels belonging to a given sector in the offscreen display canvas (not the source buffer), then marks the Three.js `CanvasTexture` as `needsUpdate = true`. Only affected pixels are touched, using precomputed `pixelIndices` from `SectorRegistry`. Enables per-sector color changes without GPU shader complexity.

**Inputs:**

- `hexKey: string` — the sector to repaint
- `color: string` — a CSS color string (e.g., `'#ff0000'`, `'rgb(255,0,0)'`)

**Outputs:**

- Mutates the display canvas `ImageData` for the specified sector's pixels; Three.js texture is marked dirty; GPU upload occurs on the next render frame.

**Implementation note — color parsing:** Do not use Canvas 2D `fillRect` or path operations on the display canvas. To resolve a CSS color string to `[r, g, b]` bytes, use a reusable 1×1 `OffscreenCanvas` helper cached on the `MapRenderer` instance:

```typescript
// Created once in the MapRenderer constructor; reused on every setSectorColor call
this._colorParserCanvas = new OffscreenCanvas(1, 1)
this._colorParserCtx = this._colorParserCanvas.getContext('2d')!

function parseCSSColor(
  ctx: OffscreenCanvasRenderingContext2D,
  color: string
): [number, number, number] {
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return [d[0], d[1], d[2]]
}
```

This leverages the browser's native CSS color parser for the full spectrum of valid CSS color strings (`#rrggbb`, `rgb()`, `hsl()`, named colors, etc.) without implementing a manual parser. If `color` is invalid, the browser silently uses the previous `fillStyle`; this is the documented undefined-behavior case for invalid inputs.

**Implementation note — pixel writing:** After resolving `[r, g, b]`, retrieve `registry.pixelIndices.get(hexKey)` and write into the **persistent `displayImageData`** (see display canvas strategy below) at byte offset `i * 4` for each flat index `i`.

**Display canvas update strategy:** `MapRenderer` retains a single persistent `ImageData` object (`displayImageData`) covering the full display canvas dimensions, initialized from `registry.sourceBuffer` at construction. `setSectorColor` mutates only the relevant bytes in `displayImageData.data`. After mutation, flush to the canvas using the dirty-rect overload of `putImageData`, scoped to the sector's bounding box:

```typescript
const bbox = registry.bboxes.get(hexKey)!
ctx.putImageData(
  displayImageData,
  0,
  0, // destination offset (always 0,0)
  bbox.minX,
  bbox.minY, // dirty rect origin
  bbox.maxX - bbox.minX + 1, // dirty rect width
  bbox.maxY - bbox.minY + 1 // dirty rect height
)
```

This writes only the bounding-box region back to the canvas element, avoiding a full-bitmap flush on every color change. Then set `texture.needsUpdate = true`.

**`texture.needsUpdate = true` — WebGL upload cost (important at scale):** Setting `texture.needsUpdate = true` instructs Three.js to call `texImage2D` internally on the next render frame, which performs a **full VRAM reallocation and a complete re-upload** of the entire texture — it does not call `texSubImage2D` (partial update). This means every `setSectorColor` call at large map scales will incur a full-texture re-upload cost on the next render frame, regardless of how small the dirty rect passed to `putImageData` was. The dirty-rect `putImageData` optimization reduces the Canvas 2D write cost only — it does not reduce the WebGL upload cost. At 4096×4096 and above, this re-upload may stall the render pipeline well beyond the 16.6 ms frame budget. The v2 shader-based color lookup upgrade path eliminates this entirely by moving color resolution to the GPU. This is accepted for v1 and must not be changed in v1.

**Do not** call `putImageData` once per pixel index (catastrophically slow). **Do not** replace `displayImageData` with a new object on each call — mutate in place.

**Edge Cases:**

- `setSectorColor` with a `hexKey` not found in `pixelIndices` (either because the key is entirely absent from the sector map, or because the sector has zero bitmap pixels and was excluded from `pixelIndices`): no-op, emit `console.warn('[MapEngine] setSectorColor: sector has no pixel data')`. Check `pixelIndices`, not the sector map, to determine actionability.
- `resetSectorColor` with a `hexKey` not found in `pixelIndices`: same no-op + `console.warn` behavior as above.
- Invalid CSS color string: behavior delegates to browser color parsing; document that invalid colors produce undefined visual results.
- `resetSectorColor(hexKey)`: copies `sourceBuffer[i*4]`, `[i*4+1]`, `[i*4+2]` into `displayImageData.data` at the same offsets for each index in `pixelIndices.get(hexKey)`; **alpha is always written as `255`** regardless of the value in `sourceBuffer` (the display canvas must always be fully opaque); flush with dirty-rect `putImageData` using the sector's bbox; mark texture dirty. Note: this means `resetSectorColor` restores original RGB but does not restore source alpha values — this is accepted and documented.

---

### 4. Pointer Picking (Hover and Click) — REQUIRED

**Description:** On pointer move and click events, the engine raycasts from the camera through the pointer position onto the map plane, computes UV coordinates, maps UV → pixel coordinate (with mandatory Y-axis inversion), reads RGB from the source buffer, resolves hex key → `SectorData`, and emits a typed event. Entirely CPU-side. No GPU readback.

**NDC conversion — DOM event to raycaster input (REQUIRED):**
`THREE.Raycaster` requires normalized device coordinates (NDC) in the range `[-1, +1]`. Convert DOM pointer event coordinates as follows:

```typescript
// Use clientX/clientY + getBoundingClientRect to correctly handle
// canvas position within the page. Do NOT use event.offsetX/Y directly
// (requires the canvas to be the exact event target) or canvas.width
// (which includes devicePixelRatio scaling and would produce wrong NDC).
const rect = canvas.getBoundingClientRect()
const ndc = new THREE.Vector2(
  ((event.clientX - rect.left) / rect.width) * 2 - 1,
  -((event.clientY - rect.top) / rect.height) * 2 + 1 // Y is negated: screen-down → NDC-down
)
raycaster.setFromCamera(ndc, camera)
```

**UV Mapping — coordinate system inversion (REQUIRED):**
Three.js `PlaneGeometry` UV coordinates origin is bottom-left (V increases upward). The pixel buffer origin is top-left (row 0 = top). The conversion **must** account for this or picking will be vertically mirrored:

```
pixelX = Math.max(0, Math.min(width  - 1, Math.floor(uv.x * width)))
pixelY = Math.max(0, Math.min(height - 1, Math.floor((1 - uv.y) * height)))
```

**UV-to-pixel clamp guarantee:** The above clamp formula guarantees that `pixelX` and `pixelY` are always within `[0, width-1]` and `[0, height-1]` respectively, regardless of floating-point edge cases (e.g., `uv.x === 1.0` produces `Math.floor(1.0 * width) = width`, then `Math.min(width - 1, width) = width - 1` — safe). **No try-catch is required around `getSectorAt` in the picking path.** The clamp ensures `getSectorAt` always receives in-bounds coordinates.

**Picking algorithm (REQUIRED — exact steps for both `pointermove` and `click`):**

1. Compute NDC from the DOM event using the `getBoundingClientRect()` formula above.
2. Call `raycaster.setFromCamera(ndc, camera)` and `raycaster.intersectObject(mesh)`.
3. If the intersection result array is **empty** (ray missed the map plane): treat as a miss. For `sectorHover`: if `_lastHexKey !== null`, emit `sectorHover` with `null` and set `_lastHexKey = null`; otherwise no-op. For `sectorClick`: no-op. Return.
4. Extract `intersection.uv`; apply UV-to-pixel conversion with Y-inversion and clamping.
5. Call `registry.getSectorAt(pixelX, pixelY)` to obtain the hex key.
6. Call `registry.getSector(hexKey)` to obtain `SectorData`.
7. **If `getSector` returns `undefined`** (bitmap-only color, anti-aliased artifact, or any pixel with no JSON definition): **treat as a miss** — same behavior as step 3. Do **not** construct a `PickResult`. Do **not** emit `sectorClick`. For `sectorHover`: if `_lastHexKey !== null`, emit `sectorHover` with `null` and set `_lastHexKey = null`. Return.
8. If `getSector` returns a defined `SectorData`: construct `PickResult { hexKey, sectorData, pixelX, pixelY }`. For `sectorHover`: compare `hexKey` to `_lastHexKey` — emit only on change; update `_lastHexKey`. For `sectorClick`: emit `sectorClick` unconditionally.

This two-step lookup (`getSectorAt` → `getSector`) is the single unambiguous code path. "A sector resolves" means `getSector(hexKey)` returned a non-`undefined` `SectorData`, not merely that `getSectorAt` returned a hex key.

**Inputs:**

- `pointermove` and `click` DOM events on the `HTMLCanvasElement`

**Outputs:**

- `sectorHover`: emitted with `PickResult` when resolved sector changes on pointer move
- `sectorClick`: emitted with `PickResult` on click; not emitted if no sector resolves
- `sectorHover` with `null`: emitted when the pointer exits the map plane entirely, or when the pointer moves over a pixel that resolves to no sector (anti-aliased edge, validation mismatch, bitmap-only color) — but only if the previous hover state was non-null

**Edge Cases:**

- `sectorHover` fires only on sector identity change, not on every pointer move tick
- Moving continuously within the same sector: one `sectorHover` event on entry, none thereafter until sector changes
- `sectorHover` continues to fire during an active pan drag; suppressing hover during drag is deferred to v2

---

### 5. Pan and Zoom Camera — REQUIRED

**Description:** An orthographic camera on the Three.js scene supporting pointer-drag pan and scroll-wheel zoom, with hardcoded bounds.

**Camera type:** `THREE.OrthographicCamera` only. `MapRenderer` and `MapEngine` are **main-thread only** and may freely reference `window`, `document`, and DOM APIs. They must never be used inside a Web Worker.

**Initial framing — "contain" strategy (REQUIRED):**
On construction, compute the camera frustum to fit the entire bitmap while preserving the bitmap's aspect ratio using the "contain" strategy:

- If the canvas is wider than the bitmap's aspect ratio: fit the bitmap vertically; horizontal margins appear on each side.
- If the canvas is taller than the bitmap's aspect ratio: fit the bitmap horizontally; vertical margins appear on top and bottom.

The initial zoom level is `1.0×`. All zoom bounds `[0.5×, 20×]` are relative to this initial zoom.

**Concrete frustum formula:**

```typescript
const bitmapAspect = registry.width / registry.height
const canvasAspect = canvas.clientWidth / canvas.clientHeight

let frustumHalfW: number
let frustumHalfH: number

if (canvasAspect >= bitmapAspect) {
  // Canvas is wider — fit height; horizontal margins appear
  frustumHalfH = registry.height / 2
  frustumHalfW = frustumHalfH * canvasAspect
} else {
  // Canvas is taller — fit width; vertical margins appear
  frustumHalfW = registry.width / 2
  frustumHalfH = frustumHalfW / canvasAspect
}

const camera = new THREE.OrthographicCamera(
  -frustumHalfW,
  frustumHalfW, // left, right
  frustumHalfH,
  -frustumHalfH, // top, bottom
  -1000,
  1000 // near, far
)
camera.position.set(0, 0, 1)
camera.zoom = 1.0
camera.updateProjectionMatrix()
```

**Canvas-pixel-to-world-space relationship (informational — used when writing tests):**

Under "contain" framing, the bitmap does not necessarily fill the canvas. For a canvas of size `(cW, cH)`:

- The frustum spans `frustumHalfW * 2` world units horizontally across `cW` canvas pixels, so `worldUnitsPerPixel = (frustumHalfW * 2) / cW`.
- The bitmap spans `registry.width` world units (`[-width/2, +width/2]`), which maps to `registry.width / (frustumHalfW * 2) * cW` canvas pixels, centered at `cW / 2`.
- **Bitmap left edge in canvas pixels:** `(cW - bitmapCanvasWidth) / 2` where `bitmapCanvasWidth = registry.width / (frustumHalfW * 2) * cW`.

Example — 800×600 canvas, 4×4 square bitmap (bitmapAspect = 1.0, canvasAspect = 1.333):

- Canvas is wider → fit height: `frustumHalfH = 2`, `frustumHalfW = 2 * 1.333 = 2.667`
- Frustum spans `5.333` world units across `800` canvas pixels → `worldUnitsPerPixel = 5.333 / 800 = 0.00667`
- Bitmap spans `4` world units = `4 / 5.333 * 800 = 600` canvas pixels, centered → left edge at canvas pixel `100`, right edge at `700`
- Bitmap occupies canvas pixels **x: 100–700, y: 0–600** (no vertical margins; 100px margin on each side horizontally)

**Pan implementation:**
Pan is implemented by modifying `camera.position.x` and `camera.position.y` in response to pointer drag. Track internal state `_isDragging: boolean` and `_lastPointerPos: { x: number; y: number }` on the `MapRenderer` instance. Three events are required:

- `pointerdown`: set `_isDragging = true`; record `_lastPointerPos = { x: event.clientX, y: event.clientY }`
- `pointermove`: if `_isDragging`, compute `deltaScreenX = event.clientX - _lastPointerPos.x` and `deltaScreenY = event.clientY - _lastPointerPos.y`; update `_lastPointerPos`; apply to camera:
  ```typescript
  const scaleX = (frustumHalfW * 2) / canvas.clientWidth
  const scaleY = (frustumHalfH * 2) / canvas.clientHeight
  camera.position.x -= (deltaScreenX * scaleX) / camera.zoom
  camera.position.y += (deltaScreenY * scaleY) / camera.zoom // Sign is opposite to X: screen-Y down (+) maps to world-Y up (+) for grab-and-drag behavior
  clampPan()
  ```
- `pointerup`: set `_isDragging = false`

**Zoom implementation:**
Zoom is implemented by modifying `camera.zoom` directly and calling `camera.updateProjectionMatrix()`. Do **not** modify the frustum `left/right/top/bottom` values for zoom — those are set once at construction and remain fixed. Register the `wheel` listener with `{ passive: false }` so that `preventDefault()` can be called:

```typescript
canvas.addEventListener(
  'wheel',
  event => {
    event.preventDefault() // prevent the browser from scrolling the page while zooming the map
    const zoomFactor = Math.pow(1.1, -event.deltaY / 100)
    // A standard mouse wheel notch (deltaY ≈ 100) zooms by approximately 10%.
    // Touchpad scrolls produce smaller deltaY values and zoom proportionally less.
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * zoomFactor, 0.5, 20.0)
    camera.updateProjectionMatrix()
    clampPan() // re-enforce pan bounds (zoom changes effective world view)
  },
  { passive: false }
)
```

**Bounds (hardcoded; not configurable in v1):**

- **Zoom:** `camera.zoom` clamped to `[0.5, 20.0]` (relative to initial `1.0×` fit).
- **Pan:** After every pan and zoom operation, clamp `camera.position.x` and `camera.position.y` to the bitmap + 10% margin:

```typescript
function clampPan() {
  camera.position.x = THREE.MathUtils.clamp(
    camera.position.x,
    -(registry.width / 2 + registry.width * 0.1),
    +(registry.width / 2 + registry.width * 0.1)
  )
  camera.position.y = THREE.MathUtils.clamp(
    camera.position.y,
    -(registry.height / 2 + registry.height * 0.1),
    +(registry.height / 2 + registry.height * 0.1)
  )
}
```

**Inputs:**

- `pointerdown` — begin drag, record start position
- `pointermove` — if dragging, update camera position
- `pointerup` — end drag
- `wheel` (with `{ passive: false }`) — zoom

**Edge Cases:**

- Touch events: out of scope; not tested
- Canvas resize after construction: not handled in v1; documented as a known limitation
- `sectorHover` continues to fire during pan drag; this is accepted for v1

---

### 6. Map Loading Pipeline (`loadMap`) — REQUIRED

**Description:** Orchestrates the full loading sequence. Returns a `Promise<void>` that resolves when the map is visible and interactive.

**Accepted input types:** `bitmapUrl: string` and `definitionUrl: string` only. No pre-fetched assets in v1.

**Loading sequence** (steps 1 and 2 run in parallel via `Promise.all`):

0. Guard checks: if `_destroyed`, throw; if `_loaded`, throw; if `_loading`, throw. Set `_loading = true`.
1. `this._parser.parse(config.bitmapUrl)` — includes `r.ok` check inside the parser (see §1)
2. `fetch(config.definitionUrl).then(r => { if (!r.ok) throw new Error(\`Failed to load definition: HTTP \${r.status} \${r.statusText}\`); return r.json(); })`
3. `new SectorRegistry(buffer, width, height, definition)`
4. `new MapRenderer(config.canvas, registry)` — initializes scene, display canvas, camera, render loop
5. Set `_loaded = true`, set `_loading = false`
6. Resolve `Promise<void>`

On rejection (any step fails): set `_loading = false` before propagating the error.

**Note on error attribution:** `Promise.all` rejects with whichever promise rejects first. If both assets fail simultaneously, only the first rejection is surfaced. Reporting both failures is not required in v1.

**Edge Cases:**

- Network failure (fetch rejects): reject with `Error` identifying which asset failed.
- HTTP error status (e.g. 404): the `r.ok` check in the parser (§1) and the inline check for the definition both catch this, rejecting with an `Error` containing the HTTP status code.
- Invalid JSON in the definition response: reject with a parse `Error`.
- `loadMap()` called a second time before `destroy()`: throw `new Error('MapEngine: already loaded — call destroy() before loading a new map')`. Do not begin loading. The `_loaded` flag is checked at the top of `loadMap()`.
- `loadMap()` called while a previous `loadMap()` is still in-flight (assets being fetched, neither resolved nor rejected): throw `new Error('MapEngine: loadMap() is already in progress')`. The `_loading` flag is checked after the `_destroyed` and `_loaded` checks. This prevents concurrent loads that would leak resources.
- `loadMap()` called after `destroy()` on a fully-loaded engine: throw `new Error('MapEngine: destroyed')`. The `_destroyed` flag is checked before `_loaded`.
- **Partial-failure recovery:** If `loadMap()` rejects after `Promise.all` resolves but during steps 3 or 4 (e.g., `MapRenderer` throws because the canvas has zero dimensions), the engine is left in a partially-initialized state (`_loaded === false`, `_destroyed === false`, but internal references may be partially set). **Call `destroy()` before retrying `loadMap()`** to release any partially-constructed resources. In this scenario, `destroy()` resets the engine to pre-load state **without** setting `_destroyed = true` (because the engine was never fully loaded), allowing a subsequent `loadMap()` call to succeed. See §7 `destroy()` contract for the exact semantics.

---

### 7. `MapEngine` Public Facade — REQUIRED

**Description:** The single consumer entry point. Wires all modules together.

**Constructor:**

```typescript
class MapEngine {
  constructor() // no arguments; canvas is provided via loadMap(config)
}
```

The constructor takes no arguments. It initializes internal flags (`_loaded = false`, `_destroyed = false`, `_loading = false`), creates the parser instance (`this._parser = new SectorBitmapParser()`), and initializes the event handler map. The canvas, bitmap URL, and definition URL are all provided later via `loadMap(config)`.

**Pre-load and post-destroy guards:**

All methods **except `destroy()`, `on()`, and `off()`** throw `new Error("MapEngine: not loaded — call loadMap() first")` if invoked before `loadMap()` resolves. After `destroy()` on a fully-loaded engine, all methods **except `destroy()` itself** throw `new Error("MapEngine: destroyed")`. `destroy()` is always idempotent — a second call returns silently without throwing.

`on()` and `off()` are explicitly exempted from the pre-load guard. Event subscription is pure bookkeeping on an internal `Map<string, Set<Function>>` and does not require loaded state. Consumers may subscribe to events before calling `loadMap()`. After `destroy()` on a fully-loaded engine, `on()` and `off()` throw `"MapEngine: destroyed"` (same as other methods).

**Public API:**

| Method / Property            | Signature                                                            | Notes                                                                       |
| ---------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `constructor`                | `() => MapEngine`                                                    | No arguments; canvas provided via `loadMap()`                               |
| `loadMap`                    | `(config: MapConfig) => Promise<void>`                               | Orchestrates full load; throws if called twice before `destroy()`           |
| `getSector`                  | `(hexKey: string) => SectorData \| undefined`                        | Registry lookup                                                             |
| `setSectorColor`             | `(hexKey: string, color: string) => void`                            | Display repaint                                                             |
| `resetSectorColor`           | `(hexKey: string) => void`                                           | Revert to source color                                                      |
| `on('sectorClick', handler)` | `handler: (result: PickResult) => void`                              | Subscribe to clicks; **works before `loadMap()`**                           |
| `on('sectorHover', handler)` | `handler: (result: PickResult \| null) => void`                      | Subscribe to hover; `null` = pointer left map; **works before `loadMap()`** |
| `off`                        | `(event: 'sectorClick' \| 'sectorHover', handler: Function) => void` | Unsubscribe; **works before `loadMap()`**                                   |
| `destroy`                    | `() => void`                                                         | Full cleanup; idempotent — never throws                                     |

**Full `on`/`off` TypeScript overloaded signatures:**

```typescript
on(event: 'sectorClick', handler: (result: PickResult) => void): void;
on(event: 'sectorHover', handler: (result: PickResult | null) => void): void;
off(event: 'sectorClick' | 'sectorHover', handler: Function): void;
```

**`off` signature note:** `off` intentionally uses `Function` (the loosest callable type) rather than overloaded typed signatures matching `on`. This is deliberate: `off` only performs a reference-identity `Set.delete(handler)` on the internal handler set. The type of the handler is irrelevant to the deletion. Overloaded signatures on `off` are not needed. Do not add them.

**Event emitter implementation:** Custom lightweight emitter — internal `Map<string, Set<Function>>`. Do **not** extend `EventTarget`.

**Listener ownership:**
`MapRenderer` owns the following event listeners on the canvas: `pointerdown` (for pan), `pointermove` (for pan), `pointerup` (for pan), and `wheel` (for zoom). `MapEngine` owns the following event listeners on the canvas: `pointermove` (for hover picking) and `click` (for click picking). Both `MapRenderer`'s `pointermove` (pan) and `MapEngine`'s `pointermove` (hover pick) coexist on the same canvas — this is intentional. During `destroy()`, each module removes only the listeners it registered.

**`destroy()` cleanup contract (in order):**

1. If already destroyed (`_destroyed === true`): return immediately (idempotent — do not throw).
2. If `_renderer` is non-null: call `_renderer.destroy()` (disposes `THREE.WebGLRenderer`, cancels animation frame via `cancelAnimationFrame(_animFrameId)`, disposes geometry, material, **and texture** (`texture.dispose()`), removes canvas event listeners owned by the renderer — `pointerdown`, `pointermove`, `pointerup`, `wheel`).
3. Remove all pointer event listeners added to the canvas by `MapEngine` itself (`pointermove` for hover, `click` for click).
4. Call `.clear()` on the internal event handler map.
5. Set `_registry = null`, `_renderer = null`, and `_loading = false`.
6. **If `_loaded === true`:** set `_destroyed = true`. Subsequent calls to all methods except `destroy()` check this flag and throw `"MapEngine: destroyed"`. This makes the engine permanently unusable; the consumer must create a new `MapEngine` instance.
7. **If `_loaded === false`** (partial-failure recovery case): do **not** set `_destroyed = true`. The engine returns to its pre-load state. `loadMap()` may be called again. This is the documented recovery path for `loadMap()` rejections that occur after `Promise.all` resolves but before `_loaded` is set.

`_parser` is instantiated once in the `MapEngine` constructor and retained for the lifetime of the instance. It is not nulled by `destroy()` — it has no state to clean up.

`SectorRegistry` has no `destroy()` method in v1; its memory is released by GC when no references remain.

**Exposed internals (for advanced use — available only after `loadMap()` resolves):**

`engine.renderer` and `engine.registry` are exposed as **getters**, not plain properties. The getters throw `new Error("MapEngine: destroyed")` after `destroy()` is called (on a fully-loaded engine), and `new Error("MapEngine: not loaded — call loadMap() first")` before `loadMap()` resolves. This ensures property access on a destroyed or uninitialized engine produces an explicit error rather than silently returning `null`.

```typescript
get renderer(): MapRenderer    // throws before load and after destroy
get registry(): SectorRegistry // throws before load and after destroy
```

Available exposed paths after load:

- `engine.renderer.scene: THREE.Scene`
- `engine.renderer.camera: THREE.OrthographicCamera`
- `engine.renderer.renderer: THREE.WebGLRenderer`
- `engine.renderer.displayCtx: OffscreenCanvasRenderingContext2D` — the 2D context of the display OffscreenCanvas; used for testing `putImageData` flush behavior and advanced pixel inspection
- `engine.registry: SectorRegistry` — provides access to `bboxes`, `centroids`, `pixelIndices`, `borderEdges`, `sourceBuffer`, `width`, `height`, `getSectorAt()`, `getSector()`, and `getSectorKeys()`.

---

### 8. Load-Time Validation — REQUIRED

**Description:** During `SectorRegistry` construction, compare bitmap hex keys against JSON definition keys. Emit `console.warn` per discrepancy. Do not throw; do not block loading.

**Exact warning format:**

- `[MapEngine] Sector '${hexKey}' is defined in sectors.json but has no pixels in the bitmap.`
- `[MapEngine] Color '${hexKey}' found in the bitmap has no corresponding entry in sectors.json.`

---

### 9. `borderEdges` Export — REQUIRED (`@experimental`)

**Description:** During the scan pass, for each pixel, check the right neighbor and the bottom neighbor. When adjacent pixels belong to different hex keys, emit one `BorderEdge`. This check runs for all pixels regardless of definition membership — bitmap-only colors participate in border edge detection. Exposed on `SectorRegistry`. Not consumed by the engine.

**`BorderEdge` shape:**

```typescript
/** @experimental — data shape may change in v2 */
interface BorderEdge {
  x: number // pixel X of the left/top pixel in the transition
  y: number // pixel Y of the left/top pixel in the transition
  direction: 'h' | 'v' // see direction label semantics note below
  sectorA: string // hex key of the pixel at (x, y)
  sectorB: string // hex key of the adjacent pixel
}
```

**Direction label semantics note:** The label names describe the scan direction (i.e., which pair of neighbors is being compared), not the geometric orientation of the resulting boundary line:

- `'h'` means the scan was comparing **horizontal neighbors** (left-right), which produces a **vertical boundary line** between them. The adjacent pixel is at `(x+1, y)`.
- `'v'` means the scan was comparing **vertical neighbors** (top-bottom), which produces a **horizontal boundary line** between them. The adjacent pixel is at `(x, y+1)`.

This is counter-intuitive relative to geometric convention. It is internally consistent — the code, tests, and acceptance criteria all use these labels as defined here. Downstream consumers should read `'h'` as "horizontal scan / vertical edge" and `'v'` as "vertical scan / horizontal edge." This will be reconsidered in v2.

**Deduplication:** A duplicate is defined as two entries with the same `(x, y, direction)` tuple. The right-then-bottom scan naturally prevents duplicates — no deduplication step is needed. Multiple edges between the same sector pair at different pixel positions are expected and correct; they are not duplicates.

---

## TECHNICAL SPEC

### Runtime Environment

- **Platform:** Browser only. No Node.js, no SSR.
- **Required browser APIs:** `createImageBitmap()`, `OffscreenCanvas`, `getImageData()`, Fetch API, `HTMLCanvasElement`, `requestAnimationFrame`
- **Web Worker compatibility:** `SectorBitmapParser` and `SectorRegistry` must be callable inside a Web Worker. Both modules must have zero references to `document`, `window`, `HTMLElement`, or any main-thread DOM globals — verifiable by `grep`.
- **Main-thread only modules:** `MapRenderer` and `MapEngine` are main-thread only. They access `window.devicePixelRatio`, the DOM canvas, and Three.js WebGL context. They must never be used inside a Web Worker.

### Build Tooling (Locked)

| Concern               | Decision                                                                                                                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundler / dev server  | **Vite** in library mode (`vite build` with `lib` entry point). Dev server: `vite dev`.                                                                                                                                 |
| Type checking         | `tsc --noEmit` with `strict: true`. Vite handles emit; `tsc` is type-check only.                                                                                                                                        |
| Test runner           | **Vitest** with browser mode (Playwright provider) for tests requiring `OffscreenCanvas` or `createImageBitmap`. Unit tests with no browser API dependencies may use Vitest in Node mode.                               |
| Bundle size reporting | `npm run size` script: run `vite build` then print gzipped size of `dist/index.js` (e.g., `gzip -c dist/index.js \| wc -c` or a Vite plugin). Measures the **full library** output only. See Bundle Size Targets below. |

### Dev Dependencies

| Package           | Version   | Purpose                                    | Notes                                                                                              |
| ----------------- | --------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `vitest`          | `^2.1.0`  | Test runner                                | `instances` config syntax requires ≥2.1                                                            |
| `@vitest/browser` | `^2.1.0`  | Browser mode provider for Vitest           | Must match `vitest` major.minor; required for `OffscreenCanvas`, `createImageBitmap`, and DOM APIs |
| `playwright`      | `^1.40.0` | Browser automation for Vitest browser mode | Provides the Chromium instance                                                                     |
| `typescript`      | `^5.0.0`  | Type checking                              | `tsc --noEmit` only; Vite handles emit                                                             |
| `vite`            | `^5.0.0`  | Bundler and dev server                     | Library mode                                                                                       |
| `sharp`           | `^0.33.0` | Test fixture generation                    | Used by `generate-fixtures.js` to create `test-4x4.png`                                            |

**Unified `vite.config.ts` — Vite library build + Vitest browser-mode testing:**

This single config file serves both `vite build` (library mode) and `vitest` (browser-mode testing). It must be created in Phase 1.

```typescript
// vite.config.ts
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      // Three.js is a peer dependency — it must NOT be bundled into the output.
      // Without this, vite build inlines ~600 KB of Three.js, exceeding the 15 KB target.
      external: ['three'],
    },
  },
  test: {
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [{ browser: 'chromium' }],
    },
  },
})
```

**Why `external: ['three']` is required:** Three.js is declared as a peer dependency (see External Dependencies). Vite's library mode resolves and bundles all imports by default. The `rollupOptions.external` directive tells Rollup to leave `import … from 'three'` statements as-is in the output, preserving the peer-dep contract and keeping the bundle within the 15 KB target. Omitting this produces a functional but ~150 KB gzipped output that silently fails the size check.

### Tech Stack

| Concern       | Choice                      | Rationale                                                  |
| ------------- | --------------------------- | ---------------------------------------------------------- |
| Language      | TypeScript (`strict: true`) | Full type safety; all public API surfaces typed            |
| Rendering     | Three.js `^0.160.0` (r160)  | Only permitted rendering dependency; peer dep, not bundled |
| Camera        | `THREE.OrthographicCamera`  | Correct for 2D flat map; no perspective distortion         |
| Module format | ESM only                    | Tree-shakeable; no UMD or CJS                              |

**Three.js version constraint note:** Three.js does not follow semver; minor version bumps frequently contain breaking changes. The `^0.160.0` constraint uses npm's `^` prefix but because Three.js uses `0.x` versioning this pin intentionally restricts to exactly r160.x patch releases (`>=0.160.0 <0.161.0`). Widening this range requires manual compatibility testing and is out of scope for v1.

### Data Storage

None. All state is in-memory for the lifetime of the `MapEngine` instance.

### External Dependencies

| Dependency | Type                          | Version           |
| ---------- | ----------------------------- | ----------------- |
| Three.js   | Peer dependency (not bundled) | `^0.160.0` (r160) |

Zero other runtime dependencies.

### Auth / Access Model

None. Asset files are static; access control is the consumer's responsibility.

### Key Architectural Decisions

**1. Color-as-identity (hex key as sector ID)**
The 6-character lowercase hex RGB string (e.g., `"820030"`) is the sector's only identifier. No separate numeric ID system exists.

**2. Hex key construction — canonical algorithm**
Every conversion from a pixel's RGB bytes to a hex key string must use this function:

```typescript
// src/utils.ts — export and reuse; do not reimplement ad hoc
export function toHexKey(r: number, g: number, b: number): string {
  return [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}
// toHexKey(0, 77, 153)  === "004d99"  ✓  (zero-padded, always 6 chars)
// 0..toString(16) + 77..toString(16) + 153..toString(16)  === "04d99"  ✗  (5 chars, bug)
```

This function is the single source of truth for hex key derivation. It must be used in `SectorRegistry` (during the scan pass and in `getSectorAt`). `MapEngine` consumes it indirectly through `registry.getSectorAt()` during pointer picking — it does not call `toHexKey` directly. `SectorBitmapParser` does **not** use it — the parser returns a raw byte buffer without sector interpretation. Do not use `toHexKey` in `SectorBitmapParser`.

**3. Strict module boundary: `SectorRegistry` has zero Three.js imports**
Enforced at the module level; verifiable by static analysis. Enables Web Worker offloading and standalone registry use.

**4. CPU-side picking from in-memory source buffer**
O(1) per pick event: UV → pixel (with Y-axis inversion) → source buffer read → `toHexKey()` → registry lookup. No GPU readback. The picking path uses a two-step lookup: `getSectorAt(pixelX, pixelY)` returns a hex key, then `getSector(hexKey)` returns `SectorData | undefined`. A `PickResult` is only constructed when `getSector` returns a defined `SectorData`.

**5. Pixel index map for O(sector-size) `setSectorColor`**
`registry.pixelIndices` (`Map<string, Uint32Array>`) is built during the single scan pass, for definition-registered sectors only. `setSectorColor` iterates only the affected pixels — never the full buffer. The source buffer is never mutated. The renderer uses the dirty-rect `putImageData` overload (scoped to `registry.bboxes.get(hexKey)`) to minimize canvas write cost.

**6. Single O(W×H) scan pass**
All derived structures (sector map, bboxes, centroids, pixel index arrays, border edges) built in one pass. No additional passes. Spatial structures (bboxes, centroids, pixelIndices) are only tracked for definition-registered sectors.

**7. Orthographic camera with hardcoded bounds**
Zoom `[0.5×, 20×]`; pan bounded to bitmap + 10% margin. Hardcoded in v1; configurable in v2. Camera framing uses the "contain" strategy (see §5).

**8. "Sector" terminology throughout**
The word "province" must not appear in any public API, type name, comment, or documentation.

**9. Continuous render loop**
The v1 render loop runs continuously via `requestAnimationFrame`. Render-on-demand optimization is deferred to v2. This decision is accepted and must not be changed in v1.

**10. `displayImageData` backed by a separate buffer from `sourceBuffer`**
`displayImageData` is constructed via `new ImageData(registry.sourceBuffer.slice(), width, height)`. The `.slice()` call is **mandatory** — it creates a copy of the source buffer. `displayImageData` must be backed by a separate buffer from `registry.sourceBuffer`. Omitting the `.slice()` would cause `setSectorColor` to corrupt the source buffer, breaking `resetSectorColor` (which copies from source to display) and pointer picking (which reads from source). This is a load-bearing copy, not a defensive measure.

**11. RGBA (4 bytes/pixel) format used throughout despite unused alpha channel**
The engine uses RGBA format everywhere — `SectorBitmapParser` outputs RGBA, `displayImageData` is RGBA, and the `CanvasTexture` is RGBA. This is deliberate: modern GPU hardware is optimized for 32-bit aligned (4-byte) memory access patterns. Attempting to use 24-bit RGB format would trigger driver-level padding to RGBA internally, often with a CPU-side repacking step that worsens performance compared to simply passing RGBA from the start. The ~33% memory overhead from the unused alpha channel is accepted as the cost of hardware-aligned access. A future contributor should not "optimize" this by switching to RGB — doing so is a de-optimization on most hardware.

### Canvas Sizing Contract

`MapRenderer` and `MapEngine` are **main-thread only** and access `window` freely. `MapRenderer` does **not** resize the canvas element — CSS sizing is the consumer's responsibility. On construction:

```typescript
// Throw if canvas has zero dimensions
if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
  throw new Error(
    'MapEngine: canvas has zero dimensions — ensure the canvas element is in the DOM ' +
      'and has non-zero CSS dimensions before calling loadMap()'
  )
}

// Configure the Three.js renderer. The third argument `false` prevents setSize from
// overriding the canvas's CSS style.width/style.height, which are the consumer's
// responsibility. setSize internally sets canvas.width and canvas.height to
// clientWidth * pixelRatio and clientHeight * pixelRatio respectively.
renderer.setPixelRatio(window.devicePixelRatio)
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
```

**Note:** Do **not** manually assign `canvas.width` and `canvas.height` before calling `renderer.setSize()`. `THREE.WebGLRenderer.setSize(width, height)` internally sets `canvas.width = width * pixelRatio` and `canvas.height = height * pixelRatio`. Manual assignment would be immediately overwritten by `setSize` and is dead code. The third parameter `false` in `renderer.setSize(clientWidth, clientHeight, false)` prevents `setSize` from also setting `canvas.style.width` and `canvas.style.height`, which would override the consumer's CSS sizing.

### Bundle Size Targets

| Scope        | Target (gzipped, excl. Three.js) |
| ------------ | -------------------------------- |
| Full library | < 15 KB                          |

Verified via `npm run size` in Phase 6. The `npm run size` script measures a single output: the gzipped size of `dist/index.js` after `vite build`. There is no separate "parsing + registry only" measurement — a single full-library target is used because there is one Vite library entry point (`src/index.ts`) and one output bundle, making per-module gzipped measurement impractical without additional tooling that is out of scope for v1.

**Prerequisite:** The Vite build config must include `rollupOptions.external: ['three']` (see the unified `vite.config.ts` in the Dev Dependencies section). Without this directive, Vite bundles Three.js into the output (~150 KB gzipped), silently exceeding the 15 KB target. The build succeeds and all functional tests pass — only the size check fails. If `npm run size` reports a value far above 15 KB, the first thing to verify is the `external` directive.

---

## DATA FORMATS

### `sectors.png` — Sector Bitmap Contract

- Format: 24-bit RGB PNG
- Every pixel must be painted with a solid, unique color corresponding to exactly one sector
- **No anti-aliasing.** No color blending at region edges. No transparency (alpha).
- Color is identity: the RGB value of a pixel is the sole mechanism for sector resolution
- Sectors may be any shape — contiguous or non-contiguous
- Minimum practical size: 1×1 pixel. Maximum: limited by available memory and device hardware texture limits (see Known Risks — `gl.MAX_TEXTURE_SIZE`).

**Void-color optimization advisory:** For maps with large non-interactive regions (oceans, borders, wastelands), consumers should **not** define those regions as entries in the JSON definition file. Undefined bitmap colors are skipped during all spatial data structure construction (bboxes, centroids, pixelIndices) — only border edge detection still considers them. This provides an implicit performance benefit during the scan pass that scales proportionally with the fraction of non-interactive pixels. On a world map where ocean covers 70% of pixels, leaving ocean pixels undefined eliminates ~70% of the `pixelIndices` memory overhead and ~70% of the centroid/bbox accumulation work.

A common convention is to designate `#000000` (black) or `#ffffff` (white) as the void/ocean color and exclude it from the JSON entirely. This is a recommendation, not an engine requirement — the engine enforces no reserved colors.

### `sectors.json` — Sector Definition File

```typescript
// SectorData is the only type for sector objects. There is no "SectorDefinition" type.
type SectorData = {
  name: string // required
  [key: string]: unknown // any additional domain-specific fields
}

type SectorDefinitionFile = Record<string, SectorData>
// Keys: 6-character lowercase zero-padded hex strings (e.g., "004d99")
// Keys are NOT normalized or validated by the engine. An uppercase key like "FF0000" will
// fail to match bitmap hex key "ff0000" and be treated as a zero-pixel definition sector.
// Correct casing is the consumer's responsibility.
//
// Runtime shape validation of SectorDefinitionFile values is NOT performed in v1.
// The engine trusts the consumer to provide conforming JSON. Malformed values
// (e.g., missing `name` field) will produce SectorData objects with `undefined` fields.
```

Example:

```json
{
  "820030": { "name": "Northern Reach", "population": 142000 },
  "004d99": { "name": "Coastal Basin", "population": 89000 }
}
```

### Shared TypeScript Types (`types.ts`)

All types below are exported publicly. **There must be no type named `SectorDefinition` anywhere in the codebase.** Use `SectorData` uniformly.

```typescript
/** User-defined data for a sector (from sectors.json value). */
type SectorData = { name: string; [key: string]: unknown }

/** The parsed sectors.json top-level object. */
type SectorDefinitionFile = Record<string, SectorData>

/** Config passed to MapEngine.loadMap(). */
interface MapConfig {
  bitmapUrl: string
  definitionUrl: string
  canvas: HTMLCanvasElement
}

/**
 * A pixel-boundary edge between two adjacent sectors.
 * @experimental — shape may change in v2
 */
interface BorderEdge {
  x: number
  y: number
  direction: 'h' | 'v' // 'h' = horizontal scan (right neighbor); 'v' = vertical scan (bottom neighbor)
  sectorA: string // hex key
  sectorB: string // hex key
}

/** Axis-aligned bounding box for a sector (pixel space). */
interface SectorBBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Result of a successful pick operation. */
interface PickResult {
  hexKey: string
  sectorData: SectorData
  pixelX: number
  pixelY: number
}
```

### Test Fixtures

Located at `test/fixtures/`. Created in Phase 1. Never modified after Phase 1.

**`test-4x4.png`** — 4×4 pixel PNG, four sectors in a 2×2 block layout:

```
┌──────────┬──────────┐
│ #ff0000  │ #00ff00  │  rows 0–1
│ (0,0)    │ (2,0)    │
├──────────┼──────────┤
│ #0000ff  │ #ffff00  │  rows 2–3
│ (0,2)    │ (2,2)    │
└──────────┴──────────┘
```

- Top-left 2×2 pixels `(0–1, 0–1)`: `#ff0000` → key `"ff0000"`
- Top-right 2×2 pixels `(2–3, 0–1)`: `#00ff00` → key `"00ff00"`
- Bottom-left 2×2 pixels `(0–1, 2–3)`: `#0000ff` → key `"0000ff"`
- Bottom-right 2×2 pixels `(2–3, 2–3)`: `#ffff00` → key `"ffff00"`
- No anti-aliasing. No alpha. Must be an RGB (not RGBA) PNG; if tooling produces RGBA, this is acceptable — the parser handles alpha bytes per §1 edge cases.

**Generation method (REQUIRED):** Generate `test-4x4.png` programmatically using a Node.js or Python script committed to `test/fixtures/generate-fixtures.js` (or `.py`). Acceptable tooling: `sharp` npm package, Python `Pillow`, or equivalent. The generation script must be committed alongside the generated PNG. Do not hand-author or commit an opaque binary without its generation source.

Correct example using `sharp` (48 bytes = 4 pixels wide × 4 pixels tall × 3 RGB channels):

```javascript
// test/fixtures/generate-fixtures.js
const sharp = require('sharp')

const pixels = Buffer.from([
  // row 0: red, red, green, green  (4 pixels × 3 bytes = 12 bytes)
  255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0,
  // row 1: red, red, green, green
  255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0,
  // row 2: blue, blue, yellow, yellow
  0, 0, 255, 0, 0, 255, 255, 255, 0, 255, 255, 0,
  // row 3: blue, blue, yellow, yellow
  0, 0, 255, 0, 0, 255, 255, 255, 0, 255, 255, 0,
])
// pixels.length must equal 48 (4 * 4 * 3)

await sharp(pixels, { raw: { width: 4, height: 4, channels: 3 } })
  .png()
  .toFile('test/fixtures/test-4x4.png')
```

**`test-4x4.json`**:

```json
{
  "ff0000": { "name": "Red Sector" },
  "00ff00": { "name": "Green Sector" },
  "0000ff": { "name": "Blue Sector" },
  "ffff00": { "name": "Yellow Sector" }
}
```

**`test-4x4-mismatch.json`** — one bitmap color with no JSON entry (`"ffff00"` — present in the bitmap but missing from this JSON), and one JSON key with no bitmap pixels (`"ffffff"` — defined in JSON but not present in the bitmap):

```json
{
  "ff0000": { "name": "Red Sector" },
  "00ff00": { "name": "Green Sector" },
  "0000ff": { "name": "Blue Sector" },
  "ffffff": { "name": "Ghost Sector — not in bitmap" }
}
```

**`test-invalid.txt`** — plain text file (content: `"not a png"`). Used for `SectorBitmapParser` error-path tests.

---

## IMPLEMENTATION PHASES

### Test Canvas Setup (shared preamble for Phases 4 and 5)

All tests requiring an `HTMLCanvasElement` must follow this setup and teardown procedure to ensure `clientWidth`/`clientHeight` are non-zero and `getBoundingClientRect()` returns valid coordinates:

1. Create an `HTMLCanvasElement` via `document.createElement('canvas')`
2. Set `style.width = '800px'` and `style.height = '600px'`
3. Append to `document.body`
4. Remove from `document.body` in test teardown (e.g., `afterEach`)

A canvas created via `document.createElement('canvas')` that is not appended to the DOM has `clientWidth === 0`, which would trigger the zero-dimensions guard in `MapRenderer`. Similarly, `getBoundingClientRect()` returns all zeros for a detached canvas, which would break pointer coordinate calculations in Phase 5 picking tests.

### Test Fixture URLs (shared preamble for Phases 2 and 5)

In Vitest browser mode, the dev server serves static files from the project root. Use absolute paths relative to the project root for test fixture URLs:

- Bitmap: `'/test/fixtures/test-4x4.png'`
- Definition: `'/test/fixtures/test-4x4.json'`
- Mismatch definition: `'/test/fixtures/test-4x4-mismatch.json'`
- Invalid file: `'/test/fixtures/test-invalid.txt'`

Do not use relative paths (e.g., `'../fixtures/test-4x4.png'`), filesystem paths (e.g., `'./test/fixtures/test-4x4.png'`), or `file://` URLs — these will fail in browser mode.

---

### Phase 1: Project Scaffolding, Toolchain, and Fixtures

- **Goal:** Establish a compiling, testable, correctly configured project with all shared types, module stubs, test fixtures (including their generation script), and size reporting infrastructure.

- **Scope:**
  - Initialize TypeScript project; `tsconfig.json` with `strict: true`, `module: ESNext`, `target: ES2020`, `moduleResolution: bundler`
  - Configure Vite in library mode: entry `src/index.ts`, output format `es`, output dir `dist/`
  - Configure Vitest with browser mode (Playwright provider) and Vite library build mode; add `vite.config.ts` using the unified configuration specified in the Dev Dependencies section (includes both `build.lib` entry point + `rollupOptions.external: ['three']` and `test.browser` settings)
  - Install dev dependencies: `vitest`, `@vitest/browser`, `playwright`, `typescript`, `vite`, `sharp`
  - Add `npm run size` script: build library then report gzipped size of `dist/index.js`
  - Create `src/utils.ts` exporting the canonical `toHexKey(r, g, b)` function
  - Create `src/types.ts` exporting: `SectorData`, `SectorDefinitionFile`, `MapConfig`, `BorderEdge`, `SectorBBox`, `PickResult`
  - Create stub modules throwing `new Error("Not implemented")` on invocation: `src/SectorBitmapParser.ts`, `src/SectorRegistry.ts`, `src/MapRenderer.ts`, `src/MapEngine.ts`
  - Create `src/index.ts` barrel exporting `MapEngine` as default and all named exports from types and modules
  - Create `test/fixtures/generate-fixtures.js` (or `.py`) and run it to produce `test-4x4.png`; commit both the script and the generated PNG; verify `test-4x4.png` is exactly 4×4 pixels
  - Create `test/fixtures/test-4x4.json`, `test-4x4-mismatch.json`, `test-invalid.txt` exactly as specified in Data Formats
  - Create `README.md` stub with installation, peer dependency, and placeholder API sections

- **Not in this phase:**
  - Any implementation logic in stubs
  - Three.js integration
  - Tests beyond compile-time checks

- **Depends on:** Nothing.

- **Acceptance criteria:**
  - [ ] `tsc --noEmit` passes with zero errors
  - [ ] `vite build` produces `dist/index.js` in ESM format (`import`/`export` syntax present in output)
  - [ ] All types from `src/types.ts` are importable in a consumer file without error
  - [ ] All stubs are importable; each throws `"Not implemented"` when called
  - [ ] `grep -r "from 'three'" src/SectorRegistry.ts` returns empty (no Three.js import in registry)
  - [ ] `npm run size` runs without error and prints a byte count
  - [ ] `test/fixtures/generate-fixtures.js` (or `.py`) exists and is committed
  - [ ] `test/fixtures/test-4x4.png` exists, is a valid 4×4 PNG with the four solid-color quadrants as specified; generated by the committed generation script, which must pass exactly 48 bytes of raw RGB data (16 pixels × 3 channels) to the image encoder. The decoded RGBA output buffer (verified in Phase 2) will be 64 bytes.
  - [ ] `test/fixtures/test-4x4.json` is valid JSON with exactly 4 keys: `"ff0000"`, `"00ff00"`, `"0000ff"`, `"ffff00"`
  - [ ] `test/fixtures/test-4x4-mismatch.json` is valid JSON with keys `"ff0000"`, `"00ff00"`, `"0000ff"`, `"ffffff"` (no `"ffff00"`)
  - [ ] `test/fixtures/test-invalid.txt` exists and is not a valid PNG
  - [ ] `vite.config.ts` exists with: (a) `build.lib` entry pointing to `src/index.ts` with `formats: ['es']`, (b) `rollupOptions.external: ['three']`, (c) browser mode enabled with Playwright provider and Chromium browser

---

### Phase 2: `SectorBitmapParser`

- **Goal:** Implement bitmap loading and pixel buffer extraction, browser-native and Web Worker compatible.

- **Scope:**
  - Implement `SectorBitmapParser` as a **class with one public instance method**:
    ```typescript
    class SectorBitmapParser {
      parse(
        source: string | Blob
      ): Promise<{ buffer: Uint8ClampedArray; width: number; height: number }>
    }
    ```
  - Runtime type check: use `typeof source === 'string'` to distinguish string from Blob. If source is neither, throw `new Error('SectorBitmapParser.parse: source must be a string URL or Blob')`.
  - If `source` is a string:
    ```typescript
    const response = await fetch(source)
    if (!response.ok)
      throw new Error(
        `SectorBitmapParser: failed to load bitmap — HTTP ${response.status} ${response.statusText}`
      )
    const blob = await response.blob()
    const bitmap = await createImageBitmap(blob)
    ```
  - If `source` is a `Blob`: `createImageBitmap(source)` directly — no fetch roundtrip
  - **Do not pass `ImageBitmapOptions` to either `createImageBitmap` call.** No `premultiplyAlpha` or `colorSpaceConversion` options in v1. This is safe because the bitmap contract guarantees opaque pixels (alpha = 255). See §1 for the full rationale and the conditions under which options would become necessary.
  - Draw the `ImageBitmap` to an `OffscreenCanvas` of matching dimensions
  - Call `ctx.getImageData(0, 0, width, height)` to extract the flat RGBA buffer
  - Return `{ buffer: imageData.data, width, height }`
  - Write tests against `test/fixtures/test-4x4.png` and `test/fixtures/test-invalid.txt`

- **Not in this phase:**
  - Pixel scanning or registry construction
  - Three.js code
  - Web Worker wiring (the module must be Worker-compatible by absence of DOM globals; Worker integration is documented in Phase 6)

- **Depends on:** Phase 1

- **Acceptance criteria:**
  - [ ] `parse('/test/fixtures/test-4x4.png')` resolves with `{ width: 4, height: 4, buffer }` where `buffer.length === 64`
  - [ ] All alpha bytes in the resolved buffer (indices 3, 7, 11, … 63) are `255`
  - [ ] Pixel `(0,0)`: `buffer[0] === 0xFF`, `buffer[1] === 0x00`, `buffer[2] === 0x00` (red)
  - [ ] Pixel `(2,0)` (flat index 8): `buffer[8] === 0x00`, `buffer[9] === 0xFF`, `buffer[10] === 0x00` (green)
  - [ ] Pixel `(0,2)` (flat index `2*4*4 = 32`): `buffer[32] === 0x00`, `buffer[33] === 0x00`, `buffer[34] === 0xFF` (blue)
  - [ ] Pixel `(2,2)` (flat index `(2*4+2)*4 = 40`): `buffer[40] === 0xFF`, `buffer[41] === 0xFF`, `buffer[42] === 0x00` (yellow)
  - [ ] `parse('/test/fixtures/test-invalid.txt')` rejects with an `Error`
  - [ ] `parse('https://nonexistent.invalid/image.png')` rejects with an `Error`
  - [ ] `parse(url)` where the server returns HTTP 404 rejects with an `Error` containing `"HTTP 404"`
  - [ ] `parse(blob)` where `blob` is a Blob of `test-4x4.png` resolves with the same result as the URL path. Create the Blob in browser mode by fetching the fixture URL: `const blob = await fetch('/test/fixtures/test-4x4.png').then(r => r.blob())`
  - [ ] `grep` on `src/SectorBitmapParser.ts` finds zero references to `document`, `window`, `HTMLElement`, `HTMLCanvasElement`
  - [ ] `grep -r "from 'three'" src/SectorBitmapParser.ts` returns empty

---

### Phase 3: `SectorRegistry`

- **Goal:** Build the complete in-memory spatial data structure from pixel buffer and JSON definition in a single O(W×H) scan.

- **Scope:**
  - Implement `SectorRegistry`:
    ```typescript
    constructor(buffer: Uint8ClampedArray, width: number, height: number, definition: SectorDefinitionFile)
    ```
  - Validate `buffer.length === width * height * 4`; throw descriptive `Error` if not
  - Single scan pass (iterate `y` 0→height-1, `x` 0→width-1):
    1. Read `R, G, B` at `(y * width + x) * 4`; call `toHexKey(r, g, b)` from `src/utils.ts`
    2. Populate sector map from `definition` (insert on first encounter); do **not** insert bitmap-only colors
    3. **Only if the hex key exists in `definition`:** update `bboxes`, accumulate centroid sum and count, append flat index `y * width + x` to the per-sector pixel index array. Bitmap-only colors are skipped for all three of these steps.
    4. Check right neighbor `(x+1, y)` if `x < width-1`; check bottom neighbor `(x, y+1)` if `y < height-1`; emit `BorderEdge` on hex-key mismatch (direction `'h'` for right neighbor, `'v'` for bottom neighbor). This check runs for **all** pixels regardless of definition membership.
  - After scan: finalize centroids; convert per-sector pixel index arrays to sorted `Uint32Array`s and store in `pixelIndices`; run load-time validation
  - Sectors in `definition` with zero bitmap pixels: warn; keep in sector map; exclude from `bboxes`, `centroids`, `pixelIndices`
  - Expose as readonly: `sourceBuffer`, `width`, `height`, `bboxes`, `centroids`, `pixelIndices`, `borderEdges`
  - Implement `getSectorAt` (with bounds checking: throw on out-of-range coordinates; floor non-integer inputs before check), `getSector`, and `getSectorKeys`

- **Not in this phase:**
  - Three.js code
  - Rendering

- **Depends on:** Phase 1 (types, fixtures, `toHexKey`). Phase 2 is **not** a required dependency for Phase 3 testing — tests may construct a 64-byte `Uint8ClampedArray` RGBA buffer directly rather than using `SectorBitmapParser`. If the agent prefers to use `SectorBitmapParser` in test setup, Phase 2 becomes an implicit dependency.

- **Acceptance criteria:**
  - [ ] Registry from `test-4x4` buffer + `test-4x4.json` has exactly 4 hex keys: `"ff0000"`, `"00ff00"`, `"0000ff"`, `"ffff00"`
  - [ ] `getSectorAt(0, 0) === "ff0000"`; `getSectorAt(3, 0) === "00ff00"`; `getSectorAt(0, 3) === "0000ff"`; `getSectorAt(3, 3) === "ffff00"`
  - [ ] `getSectorAt(-1, 0)` throws an `Error` containing `"out of bounds"`
  - [ ] `getSectorAt(4, 0)` throws an `Error` containing `"out of bounds"` (index >= width)
  - [ ] `getSector("ff0000")` returns `{ name: "Red Sector" }`
  - [ ] `getSectorKeys()` returns an array containing exactly `["ff0000", "00ff00", "0000ff", "ffff00"]` (order may vary)
  - [ ] `bboxes.get("ff0000")` deep-equals `{ minX: 0, minY: 0, maxX: 1, maxY: 1 }`
  - [ ] `bboxes.get("00ff00")` deep-equals `{ minX: 2, minY: 0, maxX: 3, maxY: 1 }`
  - [ ] `centroids.get("ff0000")` deep-equals `{ x: 0.5, y: 0.5 }` (mean of `(0,0)`, `(1,0)`, `(0,1)`, `(1,1)`)
  - [ ] `pixelIndices.get("ff0000")` is a `Uint32Array` equal to `[0, 1, 4, 5]` (flat indices in a width-4 bitmap)
  - [ ] `pixelIndices.get("00ff00")` is a `Uint32Array` equal to `[2, 3, 6, 7]`
  - [ ] `borderEdges` contains no entry where `sectorA === sectorB`
  - [ ] `borderEdges` contains exactly one entry with `{ x: 1, y: 0, direction: 'h' }` (right-neighbor scan between red pixel at col 1 and green pixel at col 2, row 0)
  - [ ] `borderEdges` contains exactly one entry with `{ x: 0, y: 1, direction: 'v' }` (bottom-neighbor scan between red pixel at row 1 and blue pixel at row 2, col 0)
  - [ ] No two `borderEdges` entries share the same `(x, y, direction)` tuple
  - [ ] `borderEdges.length === 8` (4×4 bitmap with four 2×2 quadrants: horizontal scans produce 4 edges at x=1 for rows 0–3 — red→green in rows 0,1 and blue→yellow in rows 2,3; vertical scans produce 4 edges at y=1 for columns 0–3 — red→blue in cols 0,1 and green→yellow in cols 2,3; total = 8)
  - [ ] Registry from `test-4x4-mismatch.json`: emits exactly one `console.warn` containing `"ffffff"` and exactly one containing `"ffff00"`; does not throw
  - [ ] After mismatch registry: `getSector("ffffff")` returns `{ name: "Ghost Sector — not in bitmap" }`; `bboxes.has("ffffff") === false`; `pixelIndices.has("ffffff") === false`
  - [ ] After mismatch registry: `getSectorKeys()` includes `"ffffff"` (zero-pixel JSON sector) and does **not** include `"ffff00"` (bitmap-only color, not a registered sector)
  - [ ] After mismatch registry: `pixelIndices.has("ffff00") === false` and `bboxes.has("ffff00") === false` (bitmap-only colors are not tracked in spatial data structures)
  - [ ] After mismatch registry: `borderEdges` contains at least one entry where `sectorA === 'ffff00'` or `sectorB === 'ffff00'` (bitmap-only colors still participate in border edge detection)
  - [ ] `registry.sourceBuffer` is the same reference as the buffer passed to the constructor
  - [ ] `registry.width === 4`, `registry.height === 4`
  - [ ] Buffer length mismatch: `new SectorRegistry(buffer, 99, 99, {})` throws an `Error`
  - [ ] `grep -r "from 'three'" src/SectorRegistry.ts` returns empty

---

### Phase 4: `MapRenderer`

- **Goal:** Render the map in a Three.js scene with a `CanvasTexture`, implement `setSectorColor`/`resetSectorColor`, and wire the orthographic pan/zoom camera.

- **Scope:**
  - Implement `MapRenderer`:
    ```typescript
    constructor(canvas: HTMLCanvasElement, registry: SectorRegistry)
    ```
  - Apply canvas sizing contract; throw if zero dimensions
  - Create `OffscreenCanvas` (display canvas) sized to `registry.width × registry.height`; obtain its 2D context and store as `displayCtx: OffscreenCanvasRenderingContext2D` (readonly instance field); initialize a persistent `ImageData` object: `displayImageData = new ImageData(registry.sourceBuffer.slice(), width, height)`. **The `.slice()` is mandatory** — `displayImageData` must be backed by a _separate_ buffer from `registry.sourceBuffer`. Omitting the copy will cause `setSectorColor` to corrupt the source buffer, breaking `resetSectorColor` and pointer picking. Flush to the display canvas with `displayCtx.putImageData(displayImageData, 0, 0)`; **retain `displayImageData` on the `MapRenderer` instance** — it is the mutable pixel buffer used by all subsequent `setSectorColor`/`resetSectorColor` calls. Do not recreate it on each color change.
  - Also create and retain a `_colorParserCanvas` (`new OffscreenCanvas(1, 1)`) and its 2D context on the `MapRenderer` instance, for CSS color parsing (see §3)
  - Create `THREE.WebGLRenderer({ canvas, antialias: false })`; call `renderer.setPixelRatio(window.devicePixelRatio)`; call `renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)` — the third argument `false` prevents `setSize` from overriding the consumer's CSS sizing. Do **not** manually assign `canvas.width` or `canvas.height` — `setSize` handles this internally.
  - Create `THREE.Scene`
  - Create `THREE.PlaneGeometry(registry.width, registry.height)` (1 world unit = 1 pixel)
  - **Coordinate system note:** `PlaneGeometry(w, h)` is centered at the origin, spanning `[-w/2, w/2]` on X and `[-h/2, h/2]` on Y in world space. Do **not** translate the mesh — leave it at `position (0, 0, 0)`. Pan bounds and camera framing are computed relative to these half-extent edges.
  - Create `THREE.CanvasTexture` from the display canvas; set `minFilter = THREE.NearestFilter`, `magFilter = THREE.NearestFilter`; set `texture.generateMipmaps = false`. **Mipmaps and all linear filtering must be disabled for two independent reasons:**
    - **(1) Picking correctness:** Mip blending and bilinear interpolation blend adjacent sector texels, generating intermediate RGB values that resolve to phantom sector hex keys not present in the registry. A pick hit on an interpolated texel returns a garbage hex key that silently passes through the picking algorithm unnoticed.
    - **(2) Rendering correctness:** Interpolation at sector borders creates new RGB values that do not exist in the source bitmap, producing visible phantom colors in the rendered map that misrepresent the spatial data. This is a visual corruption issue independent of picking.

    If a future contributor enables bilinear filtering or re-enables mipmaps to "improve visual quality," they will corrupt both the visual representation and the picking layer simultaneously. The `NearestFilter` + `generateMipmaps = false` combination is non-negotiable for this use case and must not be changed. **Store a reference to the texture** on the `MapRenderer` instance for disposal in `destroy()`.

  - Create `THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })`
  - Create `THREE.Mesh(geometry, material)`; add to scene
  - Create `THREE.OrthographicCamera` using the "contain" framing strategy specified in §5; set `camera.zoom = 1.0`; call `camera.updateProjectionMatrix()`
  - Store `frustumHalfW` and `frustumHalfH` as instance fields — they are needed by the pan scale conversion on every drag event
  - Initialize pan drag state: `_isDragging = false`, `_lastPointerPos = { x: 0, y: 0 }` as instance fields
  - Start `requestAnimationFrame` loop calling `renderer.render(scene, camera)` each frame — loop runs continuously; this is accepted for v1. Store the `requestAnimationFrame` return value as `_animFrameId: number` on the `MapRenderer` instance. `destroy()` calls `cancelAnimationFrame(this._animFrameId)`.
  - Implement pointer-drag pan per §5: register `pointerdown`, `pointermove`, `pointerup` listeners; use `_isDragging` and `_lastPointerPos` to compute deltas; convert to world units; call `clampPan()` after each position update
  - Implement scroll-wheel zoom per §5: register `wheel` listener with `{ passive: false }`; call `event.preventDefault()`; compute `zoomFactor = Math.pow(1.1, -event.deltaY / 100)`; modify `camera.zoom`; call `camera.updateProjectionMatrix()`; call `clampPan()`
  - Implement `setSectorColor(hexKey, color)` and `resetSectorColor(hexKey)` per §3 specification (check `pixelIndices`, not the sector map, for actionability)
  - Implement `destroy()`: call `cancelAnimationFrame(this._animFrameId)`; call `renderer.dispose()`; dispose geometry, material, **and texture** (`texture.dispose()`); remove all event listeners added to the canvas by `MapRenderer` (`pointerdown`, `pointermove`, `pointerup`, `wheel`)

- **Not in this phase:**
  - Pointer picking (wired in Phase 5)

- **Depends on:** Phase 1, Phase 3. Phase 2 is **not** a required dependency for Phase 4 testing — Phase 4 tests may construct a `Uint8ClampedArray` buffer directly (e.g., an inline 64-byte RGBA buffer for the 4×4 fixture) rather than using `SectorBitmapParser`. If the agent prefers to use `SectorBitmapParser` in test setup, Phase 2 becomes an implicit dependency.

- **Acceptance criteria (all programmatic):**

  **Test canvas setup:** Follow the shared "Test Canvas Setup" preamble above — create canvas, set `style.width = '800px'` and `style.height = '600px'`, append to `document.body`, remove in teardown.
  - [ ] After construction with a canvas sized 800×600, `canvas.width > 0` and `canvas.height > 0`
  - [ ] After one `requestAnimationFrame` tick, `threeRenderer.info.render.frame >= 1`
  - [ ] `renderer.scene instanceof THREE.Scene === true`
  - [ ] `renderer.camera instanceof THREE.OrthographicCamera === true`
  - [ ] `renderer.displayCtx` is an `OffscreenCanvasRenderingContext2D` instance (not null/undefined)
  - [ ] Construction with a canvas where `clientWidth === 0` throws the specified error message
  - [ ] After `setSectorColor('ff0000', '#0000ff')`: call `renderer.displayCtx.getImageData(0, 0, 4, 4)` on the display OffscreenCanvas (not on `displayImageData` directly — this verifies the `putImageData` flush path ran); bytes at pixel `(0,0)` (byte offset 0) are `[0, 0, 255, 255]`; bytes at pixel `(1,1)` (byte offset `(y * width + x) * 4 = (1*4+1)*4 = 20`) are `[0, 0, 255, 255]`; bytes at pixel `(2,0)` (byte offset `(0*4+2)*4 = 8`) are `[0, 255, 0, 255]` (green sector, unchanged)
  - [ ] After `setSectorColor('ff0000', '#0000ff')`: `registry.sourceBuffer` bytes at pixel `(0,0)` are still `[255, 0, 0, 255]` — the source buffer is **not** mutated by `setSectorColor`
  - [ ] After `resetSectorColor('ff0000')`: same `renderer.displayCtx.getImageData()` call returns `[255, 0, 0, 255]` at pixel `(0,0)`
  - [ ] `setSectorColor` with unknown hex key (not present in `pixelIndices`) emits `console.warn` and does not throw
  - [ ] `setSectorColor` for a sector that exists in the sector map but has zero bitmap pixels (not in `pixelIndices`): emits `console.warn` and does not throw
  - [ ] Pan direction test: record `camera.position.x`; dispatch `pointerdown` at `(100, 100)` then `pointermove` to `(150, 100)` on the canvas (rightward drag); assert `camera.position.x` **decreased** (world pans left, matching cursor drag direction)
  - [ ] Pan Y-axis test: record `camera.position.y`; dispatch `pointerdown` at `(100, 100)` then `pointermove` to `(100, 150)` on the canvas (downward drag); assert `camera.position.y` **increased** (downward drag → positive screen delta → camera moves up in world space → map follows cursor down)
  - [ ] Zoom-in test: record `camera.zoom`; dispatch `wheel` event with `deltaY: -100` on canvas; assert `camera.zoom` increased (scroll-up = zoom-in)
  - [ ] Zoom-out test: dispatch `wheel` event with `deltaY: +100` on canvas; assert `camera.zoom` **decreased** (scroll-down = zoom-out)
  - [ ] Zoom clamp test: force camera to maximum zoom (`20×`); dispatch further zoom-in wheel event; assert `camera.zoom` is unchanged
  - [ ] Zoom min clamp test: force camera to minimum zoom (`0.5×`); dispatch zoom-out wheel event; assert `camera.zoom` is unchanged
  - [ ] Pan clamp test: programmatically set `camera.position.x = registry.width * 2`; dispatch a `wheel` event with `deltaY: 0` on the canvas (triggers the zoom handler, which calls `clampPan()`); assert `camera.position.x <= registry.width / 2 + registry.width * 0.1`
  - [ ] PlaneGeometry UV origin convention: after construction, the `PlaneGeometry`'s UV attribute at vertex index 0 (top-left of the plane) has `u ≈ 0.0, v ≈ 1.0`, confirming Three.js bottom-left UV origin convention. This directly validates the assumption the Y-inversion formula depends on.
  - [ ] `destroy()` does not throw; calling `destroy()` a second time does not throw

---

### Phase 5: `MapEngine` Facade and Pointer Picking

- **Goal:** Wire all modules behind the public API, implement CPU-side picking with correct UV-to-pixel mapping, and emit typed hover/click events.

- **Scope:**
  - Implement `MapEngine` with a **zero-argument constructor** that:
    - Initializes internal flags: `_loaded: boolean = false`, `_destroyed: boolean = false`, `_loading: boolean = false`
    - Initializes hover tracking state: `_lastHexKey: string | null = null` (tracks the hex key from the most recent `sectorHover` emission for change-detection; updated in picking algorithm steps 3, 7, and 8)
    - Creates the parser: `this._parser = new SectorBitmapParser()` — instantiated once in the constructor and retained for the lifetime of the instance; not nulled by `destroy()`
    - Initializes the event handler map: `Map<string, Set<Function>>`
  - Implement `on` / `off` using `Map<string, Set<Function>>` with the overloaded TypeScript signatures specified in §7. `off` uses a single `Function` parameter (not overloaded) — this is intentional per §7. `on()` and `off()` do **not** check `_loaded` — they work before `loadMap()` resolves. They **do** check `_destroyed` — after `destroy()` on a fully-loaded engine, they throw `"MapEngine: destroyed"`.
  - Implement `loadMap(config)`:
    - Check `_destroyed` at the top; if true, throw `new Error('MapEngine: destroyed')`
    - Check `_loaded`; if true, throw `new Error('MapEngine: already loaded — call destroy() before loading a new map')`
    - Check `_loading`; if true, throw `new Error('MapEngine: loadMap() is already in progress')`
    - Set `_loading = true`
    - Run: `Promise.all([this._parser.parse(bitmapUrl), fetch(definitionUrl).then(r => { if (!r.ok) throw new Error(\`Failed to load definition: HTTP \${r.status} \${r.statusText}\`); return r.json(); })])`→ construct`SectorRegistry`→ construct`MapRenderer`→ set`\_loaded = true`, set `\_loading = false`
    - On rejection: set `_loading = false` before propagating. Internal references may be partially set. The consumer must call `destroy()` before retrying. Per §7 `destroy()` contract step 7, because `_loaded` is `false`, `destroy()` resets the engine to pre-load state without setting `_destroyed = true`, allowing a subsequent `loadMap()` call.
  - Expose `renderer` and `registry` as getters that throw `"MapEngine: not loaded"` before load and `"MapEngine: destroyed"` after destroy
  - Implement pointer picking per the exact algorithm specified in §4:
    - Register `pointermove` listener on the canvas (owned by `MapEngine` — separate from `MapRenderer`'s `pointermove` for pan)
    - Register `click` listener on the canvas (owned by `MapEngine`)
    - Follow the 8-step picking algorithm in §4 exactly: NDC → raycast → intersect → UV → pixel → `getSectorAt` → `getSector` → emit or miss
  - Implement `getSector`, `setSectorColor`, `resetSectorColor` as pass-throughs to the underlying `SectorRegistry` / `MapRenderer` with pre-load and post-destroy guards (throw `"MapEngine: not loaded"` before load; throw `"MapEngine: destroyed"` after destroy on a fully-loaded engine)
  - Implement `destroy()` per §7 cleanup contract — idempotent, never throws; `_destroyed` only set to `true` if `_loaded` was `true` (see §7 step 6–7)

- **Not in this phase:**
  - Web Worker offloading

- **Depends on:** Phases 2, 3, 4

- **Acceptance criteria:**

  **Test canvas setup:** Follow the shared "Test Canvas Setup" preamble above — create canvas, set `style.width = '800px'` and `style.height = '600px'`, append to `document.body`, remove in teardown.

  **Test fixture URLs:** Use the absolute paths specified in the shared "Test Fixture URLs" preamble: `'/test/fixtures/test-4x4.png'` for `bitmapUrl`, `'/test/fixtures/test-4x4.json'` for `definitionUrl`.

  **Pointer coordinate derivation for test bitmap (read before writing tests):**
  All pointer simulations use a test canvas of 800×600. The 4×4 test bitmap is square (bitmapAspect = 1.0); the canvas is wider (canvasAspect = 1.333). Under "contain" framing:
  - `frustumHalfH = 2.0`, `frustumHalfW = 2.667`
  - The bitmap (4 world units wide) occupies `4 / 5.333 * 800 = 600` canvas pixels, centered → left edge at canvas pixel **100**, right edge at **700**; no vertical margins (bitmap fills full 600px height)
  - The four quadrants occupy canvas pixels:
    - **Red** (top-left): canvas x: 100–400, y: 0–300 → center at **(250, 150)**
    - **Green** (top-right): canvas x: 400–700, y: 0–300 → center at **(550, 150)**
    - **Blue** (bottom-left): canvas x: 100–400, y: 300–600 → center at **(250, 450)**
    - **Yellow** (bottom-right): canvas x: 400–700, y: 300–600 → center at **(550, 450)**

  **Synthetic pointer event construction note:** The NDC conversion uses `event.clientX - rect.left` and `event.clientY - rect.top` (see §4). When constructing synthetic `PointerEvent` or `MouseEvent` objects in tests, set `clientX = rect.left + canvasPixelX` and `clientY = rect.top + canvasPixelY`, where `rect = canvas.getBoundingClientRect()`. The canvas-pixel coordinates listed above are canvas-relative; they must be offset by the canvas's viewport position to produce correct `clientX`/`clientY` values:

  ```typescript
  const rect = canvas.getBoundingClientRect()
  canvas.dispatchEvent(
    new PointerEvent('pointermove', {
      clientX: rect.left + 250, // center of red quadrant
      clientY: rect.top + 150,
      bubbles: true,
    })
  )
  ```

  If the test canvas size changes, recalculate quadrant coordinates using the frustum formula in §5.

  **Off-plane pointer coordinates:** To simulate a pointer miss (ray does not intersect the mesh), dispatch events at canvas pixel `(50, 300)` — this falls in the horizontal margin outside the mesh under "contain" framing (bitmap occupies x: 100–700; x=50 is in the left margin). Use `clientX = rect.left + 50, clientY = rect.top + 300`.
  - [ ] `await engine.loadMap({ bitmapUrl, definitionUrl, canvas })` resolves without error using test fixtures
  - [ ] `loadMap()` called a second time before `destroy()` throws `'MapEngine: already loaded — call destroy() before loading a new map'`
  - [ ] `loadMap()` called while a previous `loadMap()` is still pending (not yet resolved or rejected) throws `'MapEngine: loadMap() is already in progress'`
  - [ ] `loadMap()` with unreachable `bitmapUrl` rejects with descriptive `Error`
  - [ ] `loadMap()` with unreachable `definitionUrl` rejects with descriptive `Error`
  - [ ] `loadMap()` with a `definitionUrl` returning HTTP 404 rejects with an `Error` containing `"HTTP 404"`
  - [ ] `loadMap()` with a `definitionUrl` returning HTTP 200 but non-JSON body (`"not json"`) rejects with a parse `Error`
  - [ ] After `loadMap()` rejects mid-construction (e.g., canvas has zero dimensions), calling `destroy()` then `loadMap()` again with valid inputs succeeds — the engine is not permanently destroyed by a partial failure
  - [ ] Simulating `pointermove` at canvas pixel `(250, 150)` (center of red quadrant, using `clientX = rect.left + 250`) emits `sectorHover` with `result.hexKey === 'ff0000'` and `result.sectorData.name === 'Red Sector'`
  - [ ] A second `pointermove` at `(250, 150)` does not emit another `sectorHover` event
  - [ ] `pointermove` from `(250, 150)` (red) to `(550, 150)` (green quadrant center) emits exactly one `sectorHover` with `result.hexKey === '00ff00'`
  - [ ] `pointermove` at canvas pixel `(50, 300)` (left margin, off the map plane) emits `sectorHover` with `null`
  - [ ] `click` at canvas pixel `(250, 150)` emits `sectorClick` with `result.hexKey === 'ff0000'`
  - [ ] `sectorClick` at `(250, 150)`: `result.pixelX` is in `[0, 1]` and `result.pixelY` is in `[0, 1]` (the red sector occupies the top-left 2×2 of the 4×4 test bitmap)
  - [ ] `click` at canvas pixel `(50, 300)` (left margin, off the map plane) does not emit `sectorClick`
  - [ ] **Mismatch fixture picking test:** Load with `'/test/fixtures/test-4x4-mismatch.json'` as `definitionUrl`. Dispatch `pointermove` at canvas pixel `(550, 450)` (yellow quadrant center — `"ffff00"` has no JSON entry in mismatch fixture). Assert that `sectorHover` emits `null` (not a `PickResult`), because `getSector("ffff00")` returns `undefined`.
  - [ ] `engine.getSector('ff0000')` returns `{ name: "Red Sector" }` after load
  - [ ] `engine.getSector('ff0000')` before load throws `"MapEngine: not loaded"`
  - [ ] `engine.setSectorColor('ff0000', '#0000ff')` after load does not throw; subsequent `renderer.displayCtx.getImageData()` at pixel `(0,0)` shows the color change (bytes are `[0, 0, 255, 255]`)
  - [ ] `engine.resetSectorColor('ff0000')` after load does not throw; pixel `(0,0)` reverts to `[255, 0, 0, 255]`
  - [ ] `engine.setSectorColor('ff0000', '#0000ff')` before load throws `'MapEngine: not loaded'`
  - [ ] `engine.setSectorColor('ff0000', '#0000ff')` after destroy (on a fully-loaded engine) throws `'MapEngine: destroyed'`
  - [ ] `engine.resetSectorColor('ff0000')` before load throws `'MapEngine: not loaded'`
  - [ ] `engine.resetSectorColor('ff0000')` after destroy (on a fully-loaded engine) throws `'MapEngine: destroyed'`
  - [ ] `engine.on('sectorHover', handler)` before `loadMap()` does not throw — event subscription works before load
  - [ ] `engine.off('sectorHover', handler)` before `loadMap()` does not throw — event unsubscription works before load
  - [ ] `engine.on('sectorHover', handler)` after `destroy()` (on a fully-loaded engine) throws `'MapEngine: destroyed'`
  - [ ] `engine.off('sectorHover', handler)` after `destroy()` (on a fully-loaded engine) throws `'MapEngine: destroyed'`
  - [ ] Handler registered via `on()` before `loadMap()` receives events after `loadMap()` resolves — pre-load subscription is functional
  - [ ] `engine.registry.getSectorKeys()` after load returns the same set of keys as the underlying `SectorRegistry` instance (i.e., all four keys from the test fixture)
  - [ ] `engine.renderer` accessed after `destroy()` throws `"MapEngine: destroyed"`
  - [ ] `engine.registry` accessed after `destroy()` throws `"MapEngine: destroyed"`
  - [ ] After `engine.destroy()`, dispatching a `pointermove` event on the canvas does **not** invoke the `sectorHover` callback — the engine's listener has been removed
  - [ ] `engine.destroy()` is idempotent — second call does not throw
  - [ ] Any method call **except `destroy()`, `on()`, and `off()`** after `destroy()` (on a fully-loaded engine) throws `"MapEngine: destroyed"`

---

### Phase 6: Documentation, Asset Contract, and Size Verification

- **Goal:** Produce complete integration documentation and verify all non-functional targets.

- **Scope:**
  - `README.md` (final): installation, peer dependencies, quickstart end-to-end example
  - **Sector bitmap contract**: explicit rules (no anti-aliasing, no alpha, unique colors, no blending), recommended tooling (Aseprite indexed-color mode, GIMP snap-to-grid), consequences of violations, interpretation of validation warnings
  - **`sectors.json` format reference**: key format, the zero-padding rule with correct/incorrect examples, required `name` field, arbitrary additional fields, complete example; **note that keys are not normalized by the engine — uppercase keys like `"FF0000"` will not match bitmap hex key `"ff0000"`**; **note that runtime shape validation is not performed — malformed values produce `SectorData` with `undefined` fields**
  - **Public API reference**: all methods, parameter types, return types, error conditions, which methods throw before load / after destroy; note that `destroy()` never throws; note that `on()` and `off()` work before `loadMap()` — they are exempt from the pre-load guard; note that `loadMap()` rejection after `Promise.all` resolves requires calling `destroy()` before retrying; note the partial-failure recovery semantics (engine is not permanently destroyed); note that `MapEngine` constructor takes no arguments
  - **`sectorHover` null case**: document that `null` is emitted when pointer leaves the map; handler signature is `(result: PickResult | null) => void`
  - **UV coordinate inversion note**: document the Y-axis inversion formula for consumers building their own overlay systems
  - **`borderEdges` usage note**: data shape, `@experimental` status, direction label semantics (including the counter-intuitive naming), intended use cases, engine does not consume it; bitmap-only colors participate in border edge detection
  - **Web Worker opt-in**: how to use `SectorBitmapParser` and `SectorRegistry` inside a Worker; minimal code example
  - **`getSectorKeys()` usage**: document as the canonical way to enumerate all sectors; note that zero-pixel (JSON-only) sectors are included, and bitmap-only colors are not
  - **Void-color optimization advisory**: document the recommendation to leave non-interactive regions (oceans, borders) undefined in the JSON; explain the performance benefit; document `#000000` as the conventional void color
  - **CORS deployment note**: document that bitmap assets hosted on a different origin from the application require the server to send `Access-Control-Allow-Origin` headers; explain that `fetch` handles CORS by default but server cooperation is required; link to §1 for detail
  - **Known limitations**: large bitmap memory (three buffer copies in steady state with realistic total of 400–500 MB for an 8192×4096 map); `setSectorColor` at large scale triggers full `texImage2D` re-upload per call (not `texSubImage2D`); `gl.MAX_TEXTURE_SIZE` hardware cap means bitmaps exceeding the device limit (commonly 4096 on mobile) will cause a fatal WebGL error; synchronous O(W×H) scan pass may block main thread for 200–500 ms on large maps; anti-aliasing as user error; canvas resize not handled; single map instance assumption; shader upgrade path; continuous render loop (no render-on-demand in v1); hover fires during drag (not suppressed in v1)
  - **Upgrade path notes**: adjacency graph, river layer, heightmap, shader overlay, render-on-demand, hover suppression during drag, Web Worker scan pass offloading, `texSubImage2D` partial texture updates, `gl.MAX_TEXTURE_SIZE` query + texture tiling — deferred and why
  - Run `npm run size`; confirm bundle size target

- **Not in this phase:** New implementation code; interactive demo.

- **Depends on:** Phases 1–5 complete and stable.

- **Acceptance criteria:**
  - [ ] The README quickstart section contains a complete, copy-pasteable HTML + TypeScript code example that: (a) imports `MapEngine`, (b) calls `loadMap()` with test fixtures, (c) subscribes to `sectorHover` and logs results to the console, and (d) does not reference any file or API not documented in the README. The example is syntactically valid TypeScript.
  - [ ] Bitmap contract section explicitly lists every constraint on `sectors.png`
  - [ ] Hex key zero-padding rule is documented with a correct (`"004d99"`) and incorrect (`"04d99"`) example
  - [ ] JSON key case sensitivity is explicitly documented: keys are not normalized; `"FF0000"` will not match `"ff0000"`
  - [ ] Runtime shape validation caveat documented: malformed JSON values produce `SectorData` with `undefined` fields
  - [ ] All public API methods documented with types and error conditions; `destroy()` explicitly noted as never-throws; `on()` and `off()` explicitly noted as working before `loadMap()`; `loadMap()` post-rejection retry requirement noted; partial-failure recovery semantics documented (engine not permanently destroyed); `MapEngine` constructor documented as zero-argument
  - [ ] `getSectorKeys()` documented with an example use case; bitmap-only color exclusion noted
  - [ ] `sectorHover` `null` case documented in API reference
  - [ ] `@experimental` status of `borderEdges` visible in documentation, including direction label semantics clarification
  - [ ] UV Y-axis inversion formula documented
  - [ ] Web Worker opt-in documented with code example
  - [ ] Void-color advisory documented: consumers should leave non-interactive regions undefined in JSON; `#000000` convention noted
  - [ ] CORS deployment note documented: cross-origin bitmap assets require server `Access-Control-Allow-Origin` headers
  - [ ] Known limitations section documents: memory totals (400–500 MB for large maps); `texImage2D` full re-upload per `setSectorColor` call; `gl.MAX_TEXTURE_SIZE` mobile crash risk; main-thread scan pass blocking risk for large maps
  - [ ] `npm run size` output: full library < 15 KB gzipped (excl. Three.js)
  - [ ] Out-of-scope items for v1 explicitly listed

---

## OPEN QUESTIONS & GAPS

There are no unresolved open questions. All items raised by the v1.2, v1.3, v1.4, v1.5, v1.6, v1.7, v1.8, v1.9, and v2.0 pre-build and post-build reviews have been resolved and incorporated above. Implementation may proceed from Phase 1.

---

## RESOLVED DECISIONS

All open questions from prior versions are closed. Resolutions for traceability:

| ID           | Resolution                                                                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OQ-1         | URL strings and `Blob` only; no `ArrayBuffer`/`ImageBitmap` in v1. Decision applies to Phase 2 (`SectorBitmapParser` signature) not just `loadMap`.                                                                                                                         |
| OQ-2         | `borderEdges` included in v1; marked `@experimental` in JSDoc and documentation.                                                                                                                                                                                            |
| OQ-3         | `getSectorsInRegion()` excluded from v1. User-land.                                                                                                                                                                                                                         |
| OQ-4         | Zoom `[0.5×, 20×]`; pan bounded to bitmap + 10% margin. Hardcoded. Configurable in v2.                                                                                                                                                                                      |
| OQ-5         | Custom lightweight emitter (`Map<string, Set<Function>>`). No `EventTarget`.                                                                                                                                                                                                |
| OQ-6         | **BLOCKER resolved.** Vite library mode + Vitest browser mode (Playwright). `tsc` type-check only. `npm run size` in Phase 1.                                                                                                                                               |
| OQ-7         | `THREE.OrthographicCamera`.                                                                                                                                                                                                                                                 |
| OQ-8         | Hardcoded "contain" fit-to-viewport on load. No `MapConfig` override.                                                                                                                                                                                                       |
| OQ-9         | Emit `sectorHover` with `null` when pointer leaves the map plane or resolves to an unknown pixel (if previous state was non-null).                                                                                                                                          |
| OQ-10        | Arithmetic centroid accepted for v1. Document that it may fall outside non-convex sector boundaries.                                                                                                                                                                        |
| R1-1 (v1.2)  | `displayImageData` acceptance test specifies `renderer.displayCtx.getImageData()` on the display OffscreenCanvas.                                                                                                                                                           |
| R1-2 (v1.2)  | `MapRenderer` and `MapEngine` are explicitly main-thread only; `window` access is permitted.                                                                                                                                                                                |
| R1-3 (v1.2)  | Camera initial framing is the "contain" strategy with a concrete frustum formula.                                                                                                                                                                                           |
| R1-4 (v1.2)  | Pan uses `camera.position`; zoom uses `camera.zoom` + `updateProjectionMatrix()`; pixel-to-world conversion formula specified.                                                                                                                                              |
| R1-5 (v1.2)  | `setSectorColor`/`resetSectorColor` edge-case check uses `pixelIndices`, not the sector map.                                                                                                                                                                                |
| R1-6 (v1.2)  | `borderEdges` direction label semantics documented as-is (counter-intuitive but internally consistent); reconsidered in v2.                                                                                                                                                 |
| R1-7 (v1.2)  | Pointer simulation coordinates made deterministic using concrete canvas pixel coordinates.                                                                                                                                                                                  |
| R1-8 (v1.2)  | `SectorBitmapParser` is an instanced class; `MapEngine` creates it internally.                                                                                                                                                                                              |
| R1-9 (v1.2)  | Continuous `rAF` loop is the explicit v1 decision; render-on-demand deferred to v2.                                                                                                                                                                                         |
| R1-10 (v1.2) | `loadMap()` double-call throws `'MapEngine: already loaded — call destroy() before loading a new map'`.                                                                                                                                                                     |
| R1-11 (v1.2) | Full `on`/`off` overloaded TypeScript signatures added.                                                                                                                                                                                                                     |
| R1-12 (v1.2) | `getSectorKeys(): string[]` added to `SectorRegistry` for sector enumeration.                                                                                                                                                                                               |
| R1-13 (v1.2) | `engine.renderer` and `engine.registry` are getters that throw after destroy.                                                                                                                                                                                               |
| R1-14 (v1.2) | Phase 6 quickstart criterion is now objectively verifiable (syntactically valid TypeScript, copy-pasteable).                                                                                                                                                                |
| R1-15 (v1.2) | Three.js `^0.160.0` constraint is intentional and documented; widening is out of scope.                                                                                                                                                                                     |
| R1-16 (v1.2) | `SectorBitmapParser` runtime type check specified; non-string/non-Blob throws.                                                                                                                                                                                              |
| R1-17 (v1.2) | `resetSectorColor` always writes alpha as 255; this is accepted and documented.                                                                                                                                                                                             |
| R1-18 (v1.2) | `fetch` pipeline checks `r.ok` before `.json()`; new acceptance criterion for HTTP 404 case added.                                                                                                                                                                          |
| R1-19 (v1.2) | `test-4x4.png` generated by a committed generation script (`generate-fixtures.js`).                                                                                                                                                                                         |
| R1-20 (v1.2) | `engine.registry` added to exposed internals; available after load, throws after destroy.                                                                                                                                                                                   |
| R2-1 (v1.3)  | `generate-fixtures.js` corrected: full 48-byte RGB pixel buffer, no `.flatMap` no-op.                                                                                                                                                                                       |
| R2-2 (v1.3)  | Phase 5 pointer simulation coordinates recomputed: red quadrant center = (250, 150), green = (550, 150) on 800×600 canvas with 4×4 square bitmap under "contain" framing. Derivation shown in-PRD.                                                                          |
| R2-3 (v1.3)  | Raycaster NDC conversion formula (`getBoundingClientRect()` + Y-negation) added to §4.                                                                                                                                                                                      |
| R2-4 (v1.3)  | Pan clamp test rewritten: dispatch `wheel` with `deltaY: 0` to trigger `clampPan()` via zoom handler.                                                                                                                                                                       |
| R2-5 (v1.3)  | `getSectorAt` now throws on out-of-bounds coordinates; non-integer inputs are floored.                                                                                                                                                                                      |
| R2-6 (v1.3)  | `getSectorKeys` documented to exclude bitmap-only colors; clarification added to §2 edge cases.                                                                                                                                                                             |
| R2-7 (v1.3)  | `destroy()` explicitly exempted from the "all methods throw after destroy" rule everywhere it appears.                                                                                                                                                                      |
| R2-9 (v1.3)  | `r.ok` check added to `SectorBitmapParser` string-input fetch path; Phase 2 acceptance criterion added.                                                                                                                                                                     |
| R2-11 (v1.3) | `zoomFactor = Math.pow(1.1, -event.deltaY / 100)` specified with behavioral note on wheel sensitivity.                                                                                                                                                                      |
| R2-12 (v1.3) | Phase 5 acceptance criterion for `engine.registry.getSectorKeys()` added.                                                                                                                                                                                                   |
| R3-1 (v1.4)  | Scan pass steps 3–5 (bboxes, centroids, pixelIndices) gated on definition membership; bitmap-only colors participate in border edge detection only.                                                                                                                         |
| R3-2 (v1.4)  | `renderer.displayCtx: OffscreenCanvasRenderingContext2D` exposed as readonly instance field; added to Phase 4 scope and exposed internals list.                                                                                                                             |
| R3-3 (v1.4)  | Phase 5 synthetic pointer event note added: `clientX = rect.left + canvasPixelX`, with code example.                                                                                                                                                                        |
| R3-4 (v1.4)  | `event.preventDefault()` + `{ passive: false }` added to wheel handler spec.                                                                                                                                                                                                |
| R3-5 (v1.4)  | Pan drag fully specified: `pointerup` added; `_isDragging` and `_lastPointerPos` documented; hover-during-drag noted as v1 accepted behavior (suppression deferred to v2).                                                                                                  |
| R3-6 (v1.4)  | `loadMap()` partial-failure edge case documented: call `destroy()` before retrying if rejection occurs after `Promise.all` resolves.                                                                                                                                        |
| R4-1 (v1.5)  | Picking pipeline explicit two-step algorithm: `getSectorAt` → `getSector`; if `undefined`, treat as miss. `PickResult` only constructed when `getSector` returns defined `SectorData`.                                                                                      |
| R4-2 (v1.5)  | `displayImageData` `.slice()` documented as mandatory (load-bearing copy); acceptance criterion added verifying source buffer immutability after `setSectorColor`.                                                                                                          |
| R4-3 (v1.5)  | Pan test acceptance criteria assert direction (rightward drag → `camera.position.x` decreased) and Y-axis (downward drag → `camera.position.y` increased). Corrected in v1.7 — originally said "decreased" which was wrong.                                                 |
| R4-4 (v1.5)  | Zoom-out acceptance criterion added: `deltaY: +100` → zoom decreased.                                                                                                                                                                                                       |
| R4-5 (v1.5)  | Listener ownership subsection added to §7: `MapRenderer` owns pan/zoom listeners; `MapEngine` owns pick listeners; coexistence is intentional.                                                                                                                              |
| R4-6 (v1.5)  | UV-to-pixel clamp guarantees `getSectorAt` always receives in-bounds coordinates; no try-catch required in picking path.                                                                                                                                                    |
| R4-7 (v1.5)  | `borderEdges.length === 8` total count assertion added to Phase 3 acceptance criteria with derivation.                                                                                                                                                                      |
| R4-8 (v1.5)  | `test-4x4-mismatch.json` description reworded for clarity: `"ffff00"` is a bitmap color with no JSON entry; `"ffffff"` is a JSON key with no bitmap pixels.                                                                                                                 |
| R4-9 (v1.5)  | Texture disposal (`texture.dispose()`) added to `MapRenderer.destroy()` and §7 destroy contract step 2.                                                                                                                                                                     |
| R4-10 (v1.5) | `off` intentionally uses `Function` — documented; overloaded signatures not needed.                                                                                                                                                                                         |
| R4-11 (v1.5) | Phase 5 acceptance criteria added for `engine.setSectorColor`/`engine.resetSectorColor` pass-throughs including pre-load and post-destroy guards.                                                                                                                           |
| R4-12 (v1.5) | BLOCKER resolved: `destroy()` on a never-fully-loaded engine resets to pre-load state without setting `_destroyed = true`; `loadMap()` may be retried. Acceptance criterion added.                                                                                          |
| R4-13 (v1.5) | PlaneGeometry UV origin convention acceptance criterion added to Phase 4: vertex 0 UV ≈ `(0.0, 1.0)`.                                                                                                                                                                       |
| R4-14 (v1.5) | Split "parsing + registry < 5 KB" target dropped; single "full library < 15 KB" target retained. `npm run size` measures one output.                                                                                                                                        |
| R4-15 (v1.5) | Phase 3 acceptance criterion added: `borderEdges` with mismatch fixture contains entries involving bitmap-only color `"ffff00"`.                                                                                                                                            |
| R4-17 (v1.5) | Phase 4 dependency note: Phase 2 not required; tests may construct buffer directly.                                                                                                                                                                                         |
| R4-18 (v1.5) | JSON keys not normalized; consumer responsibility. Documented in §2 and Data Formats.                                                                                                                                                                                       |
| R5-1 (v1.6)  | BLOCKER: Pan Y-axis acceptance criterion corrected — downward drag increases `camera.position.y` (camera moves up in world space). Inline comment on formula corrected.                                                                                                     |
| R5-2 (v1.6)  | `_loading` flag added to prevent concurrent `loadMap()` calls. Guards, reset paths in resolve/reject/destroy, and acceptance criterion all specified.                                                                                                                       |
| R5-3 (v1.6)  | `_lastHexKey: string \| null = null` explicitly declared as internal state in Phase 5 scope.                                                                                                                                                                                |
| R6-1 (v1.8)  | `MapEngine` constructor is zero-argument; canvas provided via `loadMap()`. Constructor row added to API table.                                                                                                                                                              |
| R6-2 (v1.8)  | `on()` and `off()` exempted from pre-load guard. Event subscription is pure bookkeeping; works before `loadMap()`. §7 blanket statement updated; acceptance criteria added.                                                                                                 |
| R6-3 (v1.8)  | Dev dependencies table and unified `vite.config.ts` (build + test) specified. Required packages: `vitest`, `@vitest/browser`, `playwright`. Updated in v1.9 with version pins and Vite library build config.                                                                |
| R6-4 (v1.8)  | Test fixture URL pattern for Vitest browser mode: absolute paths from project root (e.g., `'/test/fixtures/test-4x4.png'`).                                                                                                                                                 |
| R6-5 (v1.8)  | Off-plane pointer test coordinates: canvas pixel `(50, 300)` in the horizontal margin.                                                                                                                                                                                      |
| R6-6 (v1.8)  | Test canvas setup documented: create, style 800×600, append to DOM, teardown. Shared preamble added before Phase 1.                                                                                                                                                         |
| R6-7 (v1.8)  | `toHexKey` usage reworded: `MapEngine` consumes indirectly via `registry.getSectorAt()`, not directly.                                                                                                                                                                      |
| R6-8 (v1.8)  | `_parser` instantiated once in `MapEngine` constructor; retained for lifetime; not nulled by `destroy()`.                                                                                                                                                                   |
| R6-9 (v1.8)  | `_animFrameId: number` stored on `MapRenderer`; `destroy()` calls `cancelAnimationFrame(_animFrameId)`.                                                                                                                                                                     |
| R6-10 (v1.8) | Phase 1 "48 bytes" criterion reworded: 48 bytes raw RGB input to encoder; decoded RGBA output is 64 bytes.                                                                                                                                                                  |
| R6-11 (v1.8) | Runtime shape validation of `SectorDefinitionFile` not performed in v1; documented as accepted behavior.                                                                                                                                                                    |
| R6-12 (v1.8) | Phase 5 acceptance criterion added: mismatch fixture picking — `pointermove` over bitmap-only `"ffff00"` emits `sectorHover` with `null`.                                                                                                                                   |
| R6-13 (v1.8) | Canvas sizing contract: manual `canvas.width`/`canvas.height` removed (dead code); `renderer.setSize(w, h, false)` used; documented.                                                                                                                                        |
| R6-14 (v1.8) | Phase 3 dependency on Phase 2 noted as unnecessary; tests may construct buffer directly.                                                                                                                                                                                    |
| R7-1 (v1.9)  | Vite library mode build config specified in unified `vite.config.ts`: `build.lib` entry, `formats: ['es']`, `rollupOptions.external: ['three']`. Three.js externalization is mandatory for the 15 KB target.                                                                |
| R7-2 (v1.9)  | Dev dependency versions pinned: `vitest` and `@vitest/browser` at `^2.1.0` (instances syntax), `playwright` at `^1.40.0`.                                                                                                                                                   |
| R7-3 (v1.9)  | Phase 5 "pointermove events not fired after destroy" reworded: dispatching `pointermove` after `destroy()` does not invoke the `sectorHover` callback.                                                                                                                      |
| R7-4 (v1.9)  | Phase 2 blob-path test: Blob created via `fetch('/test/fixtures/test-4x4.png').then(r => r.blob())` in browser mode.                                                                                                                                                        |
| R8-1 (v2.0)  | `createImageBitmap` premultiplication risk named in §1 and Known Risks. No `ImageBitmapOptions` passed in v1; safe because bitmap contract guarantees opaque pixels. Conditions requiring the options are documented.                                                       |
| R8-2 (v2.0)  | `texture.needsUpdate = true` triggers `texImage2D` (full VRAM reallocation, not `texSubImage2D`) documented in §3 and Known Risks. Dirty-rect `putImageData` reduces Canvas 2D cost only, not WebGL upload cost. V2 shader path eliminates this.                            |
| R8-3 (v2.0)  | `gl.MAX_TEXTURE_SIZE` mobile hardware cap (commonly 4096) added to Known Risks and "What v1 Explicitly Does Not Include." Engine does not query this limit; fatal `INVALID_VALUE` WebGL error is the failure mode on oversized bitmaps. Texture tiling is the v2 path.      |
| R8-4 (v2.0)  | `NearestFilter` + `generateMipmaps = false` justification strengthened in Phase 4 scope to cite two independent reasons: (1) picking correctness and (2) rendering correctness (phantom RGB values at borders).                                                             |
| R8-5 (v2.0)  | CORS / tainted-canvas deployment risk documented in §1 and Known Risks. Server must send `Access-Control-Allow-Origin` headers for cross-origin bitmap assets. No special CORS handling in engine. Phase 6 scope updated.                                                   |
| R8-6 (v2.0)  | Memory pressure model revised in Known Risks: realistic total for 8192×4096 map is 400–500 MB (was stated as ~150 MB "before pixelIndices overhead"). Breakdown: ~134 MB sourceBuffer + ~134 MB displayImageData + ~134 MB pixelIndices Uint32Arrays + GPU copy + overhead. |
| R8-7 (v2.0)  | RGBA format decision added as Key Architectural Decision #11: hardware-optimal 32-bit alignment; RGB triggers driver-level padding to RGBA internally with CPU repacking penalty.                                                                                           |
| R8-8 (v2.0)  | Void-color optimization advisory added to Data Formats (sectors.png section): undefined bitmap colors skip all spatial data structure construction; `#000000` conventional void color; performance benefit scales with non-interactive pixel fraction.                      |
| R8-9 (v2.0)  | Main-thread scan pass blocking risk added to Known Risks: O(W×H) scan is synchronous; 200–500 ms block on large maps; Web Worker offloading is v2 path; already architecturally enabled by zero-DOM-dependency constraint on `SectorBitmapParser` and `SectorRegistry`.     |

---

## KNOWN RISKS

- **Large bitmaps — memory pressure (revised estimate):** At steady state, three full copies of the pixel buffer exist in memory simultaneously: (1) `registry.sourceBuffer` (retained for picking and `resetSectorColor`), (2) `MapRenderer.displayImageData.data` (for byte-level mutation by `setSectorColor`), and (3) the display canvas's internal GPU-side bitmap (uploaded via `CanvasTexture`). For an 8192×4096 bitmap, the realistic memory total is approximately 400–500 MB: ~134 MB (sourceBuffer: 8192 × 4096 × 4 bytes) + ~134 MB (displayImageData) + ~134 MB (pixelIndices as `Uint32Array`s: up to 33.5 million pixel entries × 4 bytes per entry, assuming full sector coverage across the bitmap) + GPU-side copy + `Map` and array-object heap overhead. On memory-constrained devices or within Chromium's 4 GB V8 heap cage, this total may trigger aggressive garbage collection pauses or OOM crashes. The v2 migration path (WebAssembly linear memory for scan data, shader-based color lookup eliminating `displayImageData`) would reduce this substantially. The `setSectorColor` iterate-by-index + dirty-rect `putImageData` strategy is sound for small-to-medium maps but should be profiled at large scale.
- **`texture.needsUpdate = true` triggers `texImage2D` full re-upload:** Three.js's `CanvasTexture` update path calls `texImage2D` internally, not `texSubImage2D`. This means every `setSectorColor` call at large map scales will incur a full VRAM reallocation and complete texture re-upload on the next render frame. The dirty-rect `putImageData` optimization reduces only the Canvas 2D write cost — it does not reduce the WebGL upload cost. At 4096×4096 and above, this is not a gradual degradation but a hard performance wall (documented as 100–170 ms stall per upload on an 8K map on typical hardware), well beyond the 16.6 ms frame budget. The v2 shader-based color lookup upgrade path eliminates this entirely by moving color resolution to the GPU. This is accepted for v1; the engine does not attempt `texSubImage2D` partial updates.
- **`gl.MAX_TEXTURE_SIZE` — fatal error on mobile:** The engine does not query `gl.MAX_TEXTURE_SIZE` before instantiating the `CanvasTexture`, and does not implement texture chunking or tiling. Mobile GPUs and integrated graphics commonly cap `gl.MAX_TEXTURE_SIZE` at 4096. Attempting to instantiate a texture larger than this limit throws a fatal `INVALID_VALUE` WebGL error that halts the rendering pipeline with no graceful recovery. A consumer who ships a 4096×4096 or 8192×4096 bitmap will hit a silent crash on a significant fraction of mobile web clients. Texture tiling is the documented scaling path for v2 but is out of scope for v1. Consumers should document this constraint and test on representative mobile hardware.
- **Main-thread scan pass blocks UI on large bitmaps:** The O(W×H) scan pass during `SectorRegistry` construction runs synchronously on the main thread. For an 8192×4096 bitmap (~33.5 million pixels), this may block the UI for 200–500 ms depending on device hardware. Offloading the scan pass to a Web Worker is the documented v2 scaling path. `SectorBitmapParser` and `SectorRegistry` are already Worker-compatible by design (zero DOM dependencies), making this migration straightforward. In v1, consumers should display a loading indicator before calling `loadMap()` and be aware of this blocking behavior.
- **`createImageBitmap` premultiplication risk (latent — not active in v1):** The parser calls `createImageBitmap` without `ImageBitmapOptions`. Browsers may apply alpha premultiplication and color space conversion by default. This is safe in v1 because the bitmap contract guarantees all pixels are fully opaque (alpha = 255), making premultiplication a no-op. If the engine ever relaxes this constraint and accepts bitmaps with non-255 alpha pixels, both `createImageBitmap` call sites must be updated to pass `{ premultiplyAlpha: 'none', colorSpaceConversion: 'none' }` before the resulting buffer is used for sector identity resolution. Failure to do so would silently corrupt sector RGB IDs.
- **CORS / tainted canvas in CDN deployments:** When the bitmap URL is hosted on a different origin from the application, `fetch()` and `getImageData()` are subject to CORS restrictions. If the server does not send `Access-Control-Allow-Origin` headers, `fetch()` may reject or `getImageData()` on the resulting canvas may throw a `SecurityError`. This is an operational deployment concern, not an engine bug. The engine applies standard `fetch` semantics with no special CORS handling. Consumers deploying assets on a CDN must ensure appropriate CORS headers are configured server-side.
- **Anti-aliased bitmaps:** A user error class the engine cannot recover from. Blended edge pixels are flagged during validation but not corrected. The sector bitmap contract documentation is the primary mitigation.
- **Canvas resize:** The renderer does not respond to host element resize after construction. Documented as a known limitation; consumers must reinitialize or add their own resize handling.
- **Continuous render loop:** The `requestAnimationFrame` loop runs at up to 60 fps regardless of whether anything has changed. This is a deliberate v1 decision. On large maps or battery-constrained devices this may cause unnecessary power draw. Deferred to v2.
- **`borderEdges` direction label confusion:** The `'h'`/`'v'` labels are counter-intuitive relative to geometric convention (a "horizontal scan" produces a "vertical boundary"). This is documented and stable for v1 but should be renamed in v2 to avoid downstream confusion.
- **Hover during drag:** `sectorHover` events fire during active pan drags, which may cause unintended hover state changes in consumer UIs. Suppression during drag is deferred to v2.
- **Three.js PlaneGeometry UV convention:** The entire picking pipeline depends on `THREE.PlaneGeometry` generating UVs with origin at bottom-left and V increasing upward. This is standard Three.js behavior for r160. The Phase 4 acceptance criterion validates this convention directly. If a future Three.js patch release changes UV layout, the validation test will catch it.
