# Epic 1: Core Infrastructure and Spatial Data Parsing

**Objective:** Establish the build pipeline, test fixtures, and the foundational data ingestion layer (`SectorBitmapParser` and `SectorRegistry`) responsible for converting raw PNG data into structured, queried spatial memory.
**Scope:** Incorporates PRD Phases 1, 2, and 3.

**Verifiable & Measurable Success Criteria:**

- **Build & Toolchain:** `npm run size` executes without error and reports a full-library gzipped bundle size. `vite build` outputs an ESM format with strictly externalized Three.js dependencies (via `rollupOptions.external`).
- **Bitmap Extraction:** `SectorBitmapParser.parse()` successfully loads a given string URL or `Blob` without applying `ImageBitmapOptions`, outputting a flat `Uint8ClampedArray`. For the 4x4 test fixture, the output buffer must measure exactly 64 bytes with all alpha channels evaluating to 255.
- **Spatial Mapping:** `SectorRegistry` completes an O(W×H) scan over the array, successfully isolating exactly 4 hex keys (`ff0000`, `00ff00`, `0000ff`, `ffff00`) from the test fixture without storing bitmap-only colors in the sector map.
- **Data Integrity:** `registry.getSectorAt(x, y)` strictly maps constrained pixel coordinates to their respective hex keys. Bounds (`bboxes`), physical centers (`centroids`), and `pixelIndices` (`Uint32Array`) correctly calculate the absolute physical extents and flat index arrays for valid JSON-backed sectors. The underlying `sourceBuffer` byte array remains untouched.
- **Error Tracking:** Invalid inputs (non-string/Blob parameters, out-of-bounds queries, HTTP 404s) throw descriptive, terminal errors. Validation mismatches between bitmap keys and JSON definitions emit `console.warn` without halting construction.

---

## Tasks

### Task 1.1 — Toolchain and Build Configuration

**PRD Reference:** Phase 1 (§ "Phase 1: Project Scaffolding, Toolchain, and Fixtures"); § "Build Tooling"; § "Dev Dependencies"; § "Bundle Size Targets"

Configure the TypeScript project, Vite library build, Vitest browser-mode test runner, and the `npm run size` reporting script. This task produces no source code — only project infrastructure.

**Work:**

- Create `package.json` explicitly with the following fields (do not rely on `npm init` defaults):
  - `"type": "module"` — ESM-only package (PRD §"Build Tooling — ESM only")
  - `"main": "dist/index.js"` and `"module": "dist/index.js"` — entry point for consumers
  - `"peerDependencies": { "three": "^0.160.0" }` — Three.js is a peer dep, not bundled (PRD §"External Dependencies"); omitting this declaration means consumers won't know Three.js is required
  - `"scripts"` block to be populated by remaining steps in this task
- Initialize `tsconfig.json` with `strict: true`, `module: ESNext`, `target: ES2020`, `moduleResolution: bundler`
- Author the unified `vite.config.ts` serving both library build and Vitest browser mode:
  - `build.lib`: entry `src/index.ts`, `formats: ['es']`, `fileName: 'index'`
  - `rollupOptions.external: ['three']` — mandatory; omitting it silently bundles Three.js (~600 KB) and blows the 15 KB gzip target (PRD §"Dev Dependencies" — "Why `external: ['three']` is required")
  - `test.browser`: `enabled: true`, `provider: 'playwright'`, `instances: [{ browser: 'chromium' }]` — `instances` syntax requires `vitest@^2.1.0` (PRD §"Dev Dependencies")
- Install all dev dependencies at pinned versions: `vitest@^2.1.0`, `@vitest/browser@^2.1.0`, `playwright@^1.40.0`, `typescript@^5.0.0`, `vite@^5.0.0`, `sharp@^0.33.0`
- Add `npm run size` script to `package.json`: `vite build && gzip -c dist/index.js | wc -c` (PRD §"Build Tooling" — measures the single full-library output; no per-module targets)
- Verify `vite build` produces `dist/index.js` in ESM format (`import`/`export` syntax present in output)

**Done when:** `tsc --noEmit` passes with zero errors; `vite build` completes and emits `dist/index.js`; `npm run size` prints a byte count without error; `vite.config.ts` includes all three required sections (`build.lib`, `rollupOptions.external`, `test.browser`); `package.json` declares `"type": "module"` and `peerDependencies.three`.

---

### Task 1.2 — Shared Types, Utilities, Module Stubs, and Test Fixtures

**PRD Reference:** Phase 1 continued (§ "Phase 1: Project Scaffolding, Toolchain, and Fixtures"); § "Shared TypeScript Types"; § "Key Architectural Decisions" #2 (`toHexKey`); § "Test Fixtures"

Produce all shared source files and test fixtures that downstream tasks will build against. No implementation logic in stubs.

**Work:**

- Create `src/types.ts` exporting all six public types exactly as specified in PRD §"Shared TypeScript Types": `SectorData`, `SectorDefinitionFile`, `MapConfig`, `BorderEdge`, `SectorBBox`, `PickResult` — note: there must be no type named `SectorDefinition` anywhere in the codebase (PRD §"Shared TypeScript Types")
- Create `src/utils.ts` exporting the canonical `toHexKey(r: number, g: number, b: number): string` function — zero-padded, always 6 chars, using `.toString(16).padStart(2, '0')` per the exact implementation in PRD §"Key Architectural Decisions" #2; this is the single source of truth for hex key derivation and must not be reimplemented ad hoc elsewhere
- Create stub modules each throwing `new Error("Not implemented")` on any method call: `src/SectorBitmapParser.ts`, `src/SectorRegistry.ts`, `src/MapRenderer.ts`, `src/MapEngine.ts`
- Create `src/index.ts` barrel exporting `MapEngine` as default plus all named exports from types and modules
- Commit `test/fixtures/generate-fixtures.js` using `sharp` — pass exactly 48 bytes of raw RGB data (16 pixels × 3 channels) to create the 4×4 PNG; four 2×2 solid-color quadrants per the layout in PRD §"Test Fixtures": top-left `#ff0000`, top-right `#00ff00`, bottom-left `#0000ff`, bottom-right `#ffff00`; run the script to produce `test-4x4.png`; commit both the script and the generated PNG
- Create `test/fixtures/test-4x4.json` — exactly 4 keys: `"ff0000"`, `"00ff00"`, `"0000ff"`, `"ffff00"` with `name` fields per PRD §"Test Fixtures"
- Create `test/fixtures/test-4x4-mismatch.json` — keys `"ff0000"`, `"00ff00"`, `"0000ff"`, `"ffffff"` (no `"ffff00"`; `"ffffff"` is JSON-only / not in bitmap) per PRD §"Test Fixtures"
- Create `test/fixtures/test-invalid.txt` — plain text content `"not a png"`
- Create `README.md` stub with the following placeholder sections: installation instructions, peer dependency note (`three@^0.160.0` must be installed separately by the consumer), and a placeholder API section — content will be replaced in Task 3.5/3.6 (PRD Phase 1 scope — "Create `README.md` stub with installation, peer dependency, and placeholder API sections")
- Verify `src/index.ts` barrel export is correct after all stubs are in place; re-verify this after each subsequent epic's implementation tasks replace the stubs — if a stub file is replaced entirely rather than edited in place, the barrel import must still resolve

**Done when:** All stubs importable and throw on call; `src/types.ts` exports all six types; `toHexKey(0, 77, 153) === "004d99"`; all four fixture files exist and match PRD spec exactly; `grep -r "from 'three'" src/SectorRegistry.ts` returns empty; `README.md` exists with installation and peer dependency sections.

---

### Task 1.3 — `SectorBitmapParser`: Core Decode Pipeline

**PRD Reference:** Phase 2 (§ "Phase 2: SectorBitmapParser"); Core Functionality §1 "Sector Bitmap Parsing" (string-input fetch path, Blob-input path, OffscreenCanvas extraction)

Implement the happy-path PNG ingestion logic. Worker compatibility is enforced here by the absence of DOM globals.

**Work:**

- Implement `SectorBitmapParser` as a class with one public instance method:
  ```typescript
  parse(source: string | Blob): Promise<{ buffer: Uint8ClampedArray; width: number; height: number }>
  ```
- String path: `fetch(source)` → check `response.ok` and throw with HTTP status on failure → `response.blob()` → `createImageBitmap(blob)` — the `r.ok` check is part of the core fetch path, not an error-handling add-on; a 404 returning an HTML error page would otherwise reach `createImageBitmap` and produce a confusing decode failure rather than the specified descriptive error (PRD §1 "String-input fetch path"): `if (!response.ok) throw new Error(\`SectorBitmapParser: failed to load bitmap — HTTP ${response.status} ${response.statusText}\`)`; do not pass `ImageBitmapOptions`; safe because bitmap contract guarantees alpha = 255 (PRD §1 "createImageBitmap options — premultiplication risk")
- Blob path: `createImageBitmap(source)` directly — no fetch roundtrip (PRD §1 "Blob-input path")
- Draw the resulting `ImageBitmap` to an `OffscreenCanvas` sized to `bitmap.width × bitmap.height`; obtain the 2D context; call `ctx.getImageData(0, 0, width, height)` to extract the flat RGBA buffer; return `{ buffer: imageData.data, width, height }`
- Verify with `grep` that `src/SectorBitmapParser.ts` contains zero references to `document`, `window`, `HTMLElement`, `HTMLCanvasElement` — Worker compatibility is enforced by absence of DOM globals, not by explicit Worker wiring (PRD §1 — Worker integration deferred to v2; the module must be Worker-compatible by design)
- Verify zero `from 'three'` imports in the file

**Done when:** `parse('/test/fixtures/test-4x4.png')` resolves with `{ width: 4, height: 4, buffer }` where `buffer.length === 64`; all alpha bytes are `255`; pixel (0,0) is `[0xFF, 0x00, 0x00]` (red); pixel (2,0) flat index 8 is `[0x00, 0xFF, 0x00]` (green); pixel (0,2) flat index 32 is `[0x00, 0x00, 0xFF]` (blue); pixel (2,2) flat index 40 is `[0xFF, 0xFF, 0x00]` (yellow); Blob path resolves identically to URL path.

---

### Task 1.4 — `SectorBitmapParser`: Error Handling and Tests

**PRD Reference:** Phase 2 acceptance criteria (§ "Phase 2: SectorBitmapParser"); Core Functionality §1 "Edge Cases"; §"Test Fixture URLs" (absolute paths for browser mode)

Cover all error paths and write the full browser-mode test suite for the parser.

**Work:**

- Add runtime type guard: if `source` is neither `string` nor `Blob` at runtime, throw `new Error('SectorBitmapParser.parse: source must be a string URL or Blob')` (PRD §1 "Runtime type check" — TypeScript prevents this at compile time but untyped callers can violate it)
- Write browser-mode tests using absolute fixture URLs (PRD §"Test Fixture URLs" — use `/test/fixtures/...`, not relative or `file://` paths):
  - `parse('/test/fixtures/test-4x4.png')` — buffer length 64, correct RGBA bytes at all four quadrant pixels, all alpha bytes 255
  - `parse(blob)` where blob is created via `fetch('/test/fixtures/test-4x4.png').then(r => r.blob())` — resolves identically to the URL path (PRD Phase 2 acceptance criteria — Blob creation method specified in v1.9 changelog)
  - `parse('/test/fixtures/test-invalid.txt')` — rejects with an `Error`
  - `parse('https://nonexistent.invalid/image.png')` — rejects with an `Error`
  - 404 case: rejects with an `Error` containing `"HTTP 404"` (the `r.ok` check surfaces the status code)

**Done when:** All Phase 2 acceptance criteria pass; error messages are descriptive and match PRD spec; `grep` confirms zero DOM global references and zero `from 'three'` imports in `src/SectorBitmapParser.ts`.

---

### Task 1.5 — `SectorRegistry`: Single Scan Pass and Spatial Structures

**PRD Reference:** Phase 3 scope items 1–5 (§ "Phase 3: SectorRegistry"); Core Functionality §2 "Sector Registry Construction" (scan pass algorithm, bboxes, centroids, pixelIndices); § "Key Architectural Decisions" #6 (single O(W×H) scan pass)

Build the core scan pass that populates the sector map and all spatial data structures in one O(W×H) traversal.

**Work:**

- Implement `SectorRegistry` constructor: `(buffer: Uint8ClampedArray, width: number, height: number, definition: SectorDefinitionFile)` — validate `buffer.length === width * height * 4`; throw descriptive `Error` if not (PRD §2 "Edge Cases")
- Execute a single scan pass (y outer loop, x inner loop) — one pass for **all** structures including border edges; no second pass is permitted (PRD §"Key Architectural Decisions" #6 — "All derived structures built in one pass"):
  1. Read `R, G, B` at `(y * width + x) * 4`; call `toHexKey(r, g, b)` from `src/utils.ts`
  2. Populate sector map from `definition` on first encounter of each hex key — bitmap-only colors are **never** inserted into the sector map (PRD §2 — "Bitmap colors with no JSON definition entry are not inserted into this map")
  3. **Only if the hex key exists in `definition`:** update `bboxes` (track minX, minY, maxX, maxY); accumulate centroid sum and pixel count; append flat index `y * width + x` to the per-sector pixel index array (PRD §2 — spatial structures are only tracked for definition-registered sectors)
  4. **For every pixel regardless of definition membership:** check right neighbor `(x+1, y)` if `x < width-1`; check bottom neighbor `(x, y+1)` if `y < height-1`; push a `BorderEdge` onto a local accumulator array on hex-key mismatch — Task 1.6 defines the full `BorderEdge` shape and exposes the final array; include the accumulator as an instance field so Task 1.6 can complete it without a second pass (PRD §9 — border edges run for all pixels including bitmap-only colors; §"Key Architectural Decisions" #6)
- After scan: finalize centroids by dividing accumulated sums by pixel counts; convert per-sector pixel index arrays to **sorted** `Uint32Array`s and store in `pixelIndices` (PRD Phase 3 scope — "convert per-sector pixel index arrays to sorted Uint32Arrays")
- Expose as readonly: `sourceBuffer` (the **same reference** as the buffer passed in — not a copy; PRD §2 — `registry.sourceBuffer` is the original reference), `width`, `height`, `bboxes`, `centroids`, `pixelIndices`
- Zero-pixel JSON sectors (defined in JSON but no matching pixels in bitmap): keep in sector map so `getSector()` returns their data; exclude from `bboxes`, `centroids`, `pixelIndices` (PRD §2 "Edge Cases")
- Enforce zero Three.js imports — verifiable by `grep -r "from 'three'" src/SectorRegistry.ts` (PRD §2 "Constraint")

**Done when:** Registry from `test-4x4` buffer + `test-4x4.json` has exactly 4 hex keys; `bboxes.get("ff0000")` deep-equals `{ minX: 0, minY: 0, maxX: 1, maxY: 1 }`; `centroids.get("ff0000")` deep-equals `{ x: 0.5, y: 0.5 }`; `pixelIndices.get("ff0000")` deep-equals `new Uint32Array([0, 1, 4, 5])`; `pixelIndices.get("00ff00")` deep-equals `new Uint32Array([2, 3, 6, 7])`; `registry.sourceBuffer` is the same reference as the buffer passed to the constructor; buffer length mismatch throws.

---

### Task 1.6 — `SectorRegistry`: Border Edges, Load-Time Validation, Public Methods, and Tests

**PRD Reference:** Phase 3 acceptance criteria (§ "Phase 3: SectorRegistry"); Core Functionality §8 "Load-Time Validation"; §9 "`borderEdges` Export"; §2 "Public methods" (`getSectorAt`, `getSector`, `getSectorKeys`)

Complete the registry with border edge detection, validation warnings, and the three public query methods, then write the full test suite.

**Work:**

- During the scan pass (for **every** pixel, regardless of definition membership): check the right neighbor `(x+1, y)` if `x < width-1`; check the bottom neighbor `(x, y+1)` if `y < height-1`; emit one `BorderEdge` on hex-key mismatch (PRD §9 — border edges run for all pixels including bitmap-only colors)
  - `direction: 'h'` for horizontal scan (right neighbor) → vertical boundary line; adjacent pixel is at `(x+1, y)`
  - `direction: 'v'` for vertical scan (bottom neighbor) → horizontal boundary line; adjacent pixel is at `(x, y+1)`
  - Note: direction label names describe the scan direction, not the geometric orientation of the edge — counter-intuitive but internally consistent (PRD §9 "Direction label semantics note")
  - The right-then-bottom scan naturally prevents duplicate `(x, y, direction)` tuples — no deduplication step needed (PRD §9 "Deduplication")
- Expose `borderEdges: BorderEdge[]` as readonly on the instance
- After scan, run load-time validation (PRD §8 — exact warning strings required):
  - For each key in `definition` with zero bitmap pixels: `console.warn("[MapEngine] Sector '${hexKey}' is defined in sectors.json but has no pixels in the bitmap.")`
  - For each bitmap hex key with no `definition` entry: `console.warn("[MapEngine] Color '${hexKey}' found in the bitmap has no corresponding entry in sectors.json.")`
  - Do not throw; do not halt construction
- Implement `getSectorAt(pixelX: number, pixelY: number): string`: floor non-integer inputs before bounds check; throw `new Error('getSectorAt: coordinates out of bounds')` if out of range; read R,G,B from `sourceBuffer` at `(pixelY * width + pixelX) * 4`; return `toHexKey(r, g, b)` (PRD §2 "Public methods")
- Implement `getSector(hexKey: string): SectorData | undefined` — O(1) map lookup (PRD §2)
- Implement `getSectorKeys(): string[]` — returns all hex key strings from the sector map including zero-pixel JSON sectors; bitmap-only colors are not included (PRD §2 — "Bitmap colors with no JSON definition entry are not included")
- Write browser-mode tests covering all Phase 3 acceptance criteria, constructing buffers directly as `Uint8ClampedArray` where possible (Phase 2 not a required dependency — PRD Phase 3 §"Depends on")

**Done when:** `borderEdges.length === 8` for the 4×4 test fixture (4 horizontal-scan edges at x=1, 4 vertical-scan edges at y=1); no entry where `sectorA === sectorB`; entry `{ x: 1, y: 0, direction: 'h' }` exists; entry `{ x: 0, y: 1, direction: 'v' }` exists; mismatch fixture emits exactly one `console.warn` containing `"ffffff"` and one containing `"ffff00"` without throwing; `getSectorAt(-1, 0)` throws containing `"out of bounds"`; `getSectorKeys()` includes `"ffffff"` (zero-pixel JSON sector) and excludes `"ffff00"` (bitmap-only color); mismatch `borderEdges` contains at least one entry where `sectorA` or `sectorB` is `"ffff00"`.
