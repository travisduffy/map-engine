# SCOPE_STATEMENT.md Audit Prompt

> **Purpose:** Recurring audit process for `docs/performance-refactor/SCOPE_STATEMENT.md`. Run this whenever the scope document needs a review pass. The process reads the codebase as ground truth, uses `SCOPE_STATEMENT.md` itself as the canonical direction source, and produces a revised `SCOPE_STATEMENT.md` as the only output.
>
> **Write permission:** `docs/performance-refactor/SCOPE_STATEMENT.md` only. Everything else is read-only.

---

## Ground Rules

**Source-of-truth hierarchy (in descending authority):**

1. **The codebase** (`src/`, `test/`) — what actually exists, what is actually tested, what actually couples to what. When the SCOPE makes a factual claim about the code, the code wins.
2. **`docs/performance-refactor/SCOPE_STATEMENT.md` Sections 2–4** — canonical direction: the Core Engineering Mandates (Pillar definitions), the Evidence Base (findings, cross-analysis, root-cause hierarchy), and the Leverage Analysis (V-number scoring table, matrix categorization, dependency graph). These drive the _direction_ of the SCOPE and are not subject to revision based on codebase findings alone.
3. **`docs/performance-refactor/SCOPE_STATEMENT.md` Sections 5–9** — the auditable body: Scope Description, Tangible Deliverables, Acceptance Criteria, Exclusions, and Constraints. These must accurately reflect both the current code state and the direction established in Sections 2–4.

**Failure modes to eliminate:**

- SCOPE describes a problem that the code has already partially or fully addressed.
- SCOPE claims "tests pass unchanged" when the named test file directly exercises the property being restructured.
- SCOPE calls something "the public API" when it is actually a `Map<string,…>`-shaped structural property accessed directly in tests.
- SCOPE describes a deliverable's integration without noting the existing architecture it must compose with.
- SCOPE gives a code sketch that is silently wrong (wrong Y-axis, wrong row order, wrong API surface, wrong buffer ownership, wrong WebGL call signature).
- SCOPE describes a dependency as a "constructor takes X" or "hooks via Y" without noting what must be decoupled first.
- SCOPE explicitly marks a data structure as "preserved" when tests directly access it via `.get()`, `.has()`, `.values()`, or index — the SCOPE's own claim is not evidence of safety; the tests are.

---

## Phase 1 — Load Canonical Direction

Read `docs/performance-refactor/SCOPE_STATEMENT.md` in full before touching the codebase. It is the single document — canonical direction and auditable body in one.

Read it section by section and extract the following:

- **Sections 2–4 (direction):** The seven Pillar definitions (Section 2); the key findings, cross-analysis confidence %, and root-cause hierarchy (Section 3); the V1–V20 scoring table, matrix categorization, and dependency graph (Section 4). Hold these as read-only reference — they define what the architecture must become and why.
- **Sections 5–9 (auditable body):** Extract:
  - Every deliverable name and its claimed problem / solution / acceptance criterion.
  - Every "zero API break" claim and what specifically it covers.
  - Every "tests pass unchanged" claim — record the exact scope of the claim.
  - Every "~N LOC" estimate and implementation sketch.
  - Every stated architectural prerequisite (e.g., "V3 before V7").
  - Every data structure explicitly marked as "preserved" or "unchanged" — these will all be verified against tests regardless of the SCOPE's assertion.
  - Every "intentionally updated" test assertion claim — record the exact test file, AC label, and line number cited. These will be verified for completeness (are there uncited assertions on the same field?) in Phase 3.

---

## Phase 2 — Read the Entire Codebase

**Before reading any files, run these two enumeration commands in parallel:**

- `ls test/` — discover all test files, including utility/helper files not listed below.
- `ls src/internal/` — discover all internal modules.

Then read ALL of the following files. Do not skip. The codebase is the ground truth.

**Source files** (read in parallel):

- `src/index.ts` — exports; defines the public API surface.
- `src/types.ts` — all public TypeScript types and interfaces.
- `src/utils.ts` — `toHexKey` and any other utilities.
- `src/SectorBitmapParser.ts` — parse pipeline; what it returns and what it allocates.
- `src/SectorRegistry.ts` — full constructor, all properties, all public methods. Note every `Map<string,…>`, every allocation, every `@deprecated` annotation.
- `src/MapRenderer.ts` — full rAF loop, all dirty-rect logic, all event handlers, all `_internal` methods. Read every line of the constructor. Note the constructor's parameter count and types.
- `src/MapEngine.ts` — `loadMap`, `_preRenderHook` injection, `_inTick` flag, `setSectorColor`/`resetSectorColor` dispatch paths, frame callback system.
- `src/GameClock.ts` — constructor signature (what dependencies it takes), how it hooks into the frame system, all private fields and their TypeScript types.
- All files discovered under `src/internal/`.

**Test files** (read in parallel):

- `test/SectorRegistry.test.ts` — what properties and methods are directly asserted.
- `test/GameClock.test.ts` — how the clock is constructed in tests; what it depends on; which private fields are accessed via `clock['_fieldName']`; which assertions use `toBeCloseTo` vs `toBe` vs `toEqual`.
- `test/MapEngine.test.ts` — consumer-surface test coverage.
- `test/MapRenderer.test.ts` — what renderer internals are directly tested; how many arguments are passed to `new MapRenderer(...)` — if fewer than the constructor requires, note it.
- `test/AdjacencyGraph.test.ts` — adjacency API shape being tested; note whether assertions use `toBe` (reference equality) or `toEqual` (deep equality).
- `test/FrameHook.test.ts` — frame hook behavior being tested; which `registry.*` properties are accessed.
- `test/testUtils.ts` — shared utilities used across test files.
- Any other files discovered under `test/`.

---

## Phase 3 — Build the Fact Sheet

Before auditing the SCOPE, write down (mentally or inline) the following facts extracted from the code. These are the anchors you will use to validate or invalidate every SCOPE claim.

### Render loop topology

- What is the exact call order inside the rAF loop in `MapRenderer`?
- Is `renderer.render()` gated by any flag, or is it unconditional?
- What does `_preRenderHook` do, and at what point in the loop does it run?
- What is `_inTick` and what does it gate?
- What is `_pendingDirtyRect` and how is it populated and flushed?
- Are there two paths to `texture.needsUpdate = true`? Name them.

### SectorRegistry data layout

- List every property on `SectorRegistry` and its TypeScript type.
- Which properties are `Map<string,…>`? Which are TypedArrays? Which are plain arrays?
- Which properties are marked `@deprecated` or `@experimental`?
- What does `borderEdges` cost and when is it allocated?
- Is `displayImageData.data` the same buffer as `registry.sourceBuffer`, or an independent copy? (Check for `.slice()`.)

### Three.js texture upload orientation

- Does `MapRenderer` set `_texture.flipY`? If not set explicitly, the Three.js `CanvasTexture` default is `flipY = true`.
- If `flipY = true`, the initial `texImage2D` upload stores canvas rows **bottom-to-top** in GPU memory (canvas row 0 → GPU texture bottom; canvas row `height−1` → GPU texture top). This is the orientation all subsequent `texSubImage2D` calls must match.
- `UNPACK_FLIP_Y_WEBGL` applies **only to TexImageSource types** (ImageData, HTMLCanvasElement, HTMLVideoElement, ImageBitmap) per the WebGL spec. It does NOT apply to raw TypedArray sources. Any `texSubImage2D` call using a TypedArray (e.g., `displayImageData.data`) must supply rows in the correct orientation explicitly — the GL parameter will not flip them automatically.
- Consequence: a code sketch that provides TypedArray data starting at the top of the dirty rect (`bbox.minY`) with only a Y-offset formula correction is wrong for multi-row dirty rects. The Y-offset places the rectangle at the correct texture position, but the row ORDER within the rectangle must also be inverted (bottom-to-top canvas order) to match the initial upload.

### GameClock coupling

- What does the `GameClock` constructor accept as arguments? What is the TypeScript type of each argument?
- How does it register with the frame system? (`engine.onFrame`? Direct rAF?)
- What must be unwired before `GameClock` can be moved to a Worker?
- List all private fields in `GameClock` and their TypeScript types. Note which are `number` vs `bigint` — this matters for test compatibility.
- For any BigInt accumulator refactor: how does the `_speed` multiplier (a float) compose with the microsecond accumulator? The correct conversion is `BigInt(Math.round(dt * this._speed * 1e6))` — not `BigInt(Math.round(dt * 1e6))` accumulated and then speed applied separately, which would lose the fractional seconds correctly.

### Test coverage of structural properties — exhaustive scan

- Does any test directly call `registry.bboxes.get(…)`, `registry.centroids.get(…)`, `registry.pixelIndices.get(…)`, `registry.borderEdges[…]`, or `registry.adjacency.get(…)`?
- For each such call, note whether the test uses `toBe` (reference equality) or `toEqual` (deep equality). `toBe` assertions will break even if the content is logically identical — the reference to the specific object instance is what is tested.
- Does any test access a **private field** via bracket notation (e.g., `clock['_accumulator']`)? If yes, note the field name and what assertion operator is used. If a field is being renamed or retyped, these accesses break even if the test is otherwise semantically valid.
- Does any test use `toBeCloseTo` or arithmetic assertions on a field whose TYPE is changing (e.g., `number` → `bigint`)? BigInt is not a Number — `toBeCloseTo` will throw or fail.

### Constructor arity discrepancy

- For each class under audit, compare the constructor parameter count and types in the source file against how tests construct the class.
- If tests omit required constructor arguments, the missing parameter is `undefined` at runtime. This works silently only if the constructor has a falsy guard on that parameter. Note any discrepancy — it constrains how new constructor-level state (flags, options) can be added and tested.

### Public API boundary

- What does `src/index.ts` export?
- What does `MapEngine` expose to consumers (methods + events)?
- Are `registry.bboxes`, `registry.centroids`, `registry.pixelIndices` part of the exported/consumer API, or are they internal implementation details accessed directly in tests?

---

## Phase 4 — Systematic Deliverable Audit

For each Phase A and Phase B deliverable in the current SCOPE_STATEMENT.md, apply the following checklist:

### Checklist per deliverable

**[ ] Problem existence check**
Does the described problem actually exist in the current code? Cite the file and line(s). If the code has already partially addressed the problem (e.g., a partial optimization exists), the SCOPE must acknowledge the existing work and describe how the deliverable builds on or replaces it.

**[ ] Solution integration check**
Does the described solution compose correctly with the existing architecture? Specifically:

- Does it interact with `_preRenderHook`, `_inTick`, `_flushPendingDirty`, or `_pendingDirtyRect`? If so, how?
- Does it depend on any method or property that will be renamed or removed by another deliverable in the same phase?
- Does it have any hidden constructor coupling (e.g., class A takes class B in its constructor) that must be broken first?

**[ ] Acceptance criteria accuracy**
Is each acceptance criterion actually achievable given the codebase? Check specifically:

- When the SCOPE claims a set of tests will "pass unchanged", scan those test files for: (a) `toBeCloseTo` or arithmetic assertions on any field whose TYPE is changing (e.g., `number` → `bigint`); (b) `toBe` (reference equality) assertions on objects that will be rebuilt from new structures — `toBe` breaks even if the content is identical; (c) direct private field accesses (`obj['_fieldName']`) on fields being renamed or retyped; (d) assertions on side effects of a write path being removed (see "write-path removal" and "`texture.needsUpdate`" gotchas in Phase 5).
- Are any criteria internally contradictory (e.g., "replace all Maps" AND "tests pass unchanged" when tests call `.get()` on those Maps)?
- Does the SCOPE explicitly mark a data structure as "preserved"? If yes, verify it against ALL test files — the SCOPE's assertion is a claim to test, not a fact to accept.
- **Line number verification:** If the SCOPE cites specific test file line numbers (e.g., "AC 2.1b line 83"), look up those exact lines in the actual file. Count total instances of the access pattern in the file — there may be additional uncited occurrences in other test cases. An off-by-one in the cited line number is common and usually indicates an adjacent but uncited assertion was also missed.
- **Indirect access is not direct access:** If the SCOPE says a test file needs updating because an _implementation method_ (not the test assertion itself) calls `.get()`/`.has()` on a changing structure, verify what the test assertions actually check. If the assertions only verify behavioral outcomes (pixel values, return values, console output) rather than the structure's shape, the _implementation_ needs updating but the tests pass unchanged.

**[ ] LOC / sketch accuracy**
If the SCOPE gives a code sketch or LOC estimate, verify it against the actual source. Flag sketches that are wrong (wrong Y-axis, wrong row order, wrong API surface, wrong buffer ownership, wrong WebGL call signature, wrong TypedArray constructor, wrong accumulator conversion).

**[ ] "Zero API break" precision**
If the deliverable claims zero API break, specify exactly which API surface is preserved and which is intentionally changed. Distinguish:

- The `MapEngine` consumer surface (events, loadMap, setSectorColor, getSector) — typically preserved.
- `SectorRegistry` structural properties (`bboxes`, `centroids`, `pixelIndices`, `adjacency`) — these are tested directly and will change shape in B1.
- Private fields (prefixed `_`) — can change type/name freely, BUT only if no test accesses them via bracket notation.
- Internal properties (prefixed `_` AND not accessed by tests) — can change freely.

**[ ] Missing prerequisites**
Does the SCOPE describe all architectural prerequisites? Check specifically:

- Tight constructor coupling that must be decoupled (e.g., `GameClock(engine: MapEngine)` before B3).
- Ordering within a phase (e.g., V10 `IRenderBackend` must exist before B2 spike).
- Browser/environment prerequisites (COOP/COEP for SAB, WebGL2 for UNPACK_ROW_LENGTH).

**[ ] Internal API fragility**
Does the implementation path use a library's internal/undocumented API? If so:

- Name the internal explicitly (e.g., `renderer.properties.get(texture).__webglTexture`).
- Note the version pinning requirement.
- Note this is an intentional trade-off, not an oversight.

---

## Phase 5 — Known Gotcha Checklist

These are recurring patterns that have caused inaccuracies in past audits. Check each explicitly.

**[ ] WebGL Y-axis inversion — coordinate position**
Any dirty-rect coordinates passed to `gl.texSubImage2D` must be Y-flipped relative to canvas/ImageData coordinates. WebGL origin is bottom-left; canvas/ImageData origin is top-left. Verify any code sketch involving `gl.texSubImage2D` uses `(height - bbox.maxY - 1)` for the Y parameter. This is necessary but not sufficient — see the row-order gotcha below.

**[ ] WebGL Y-axis inversion — row order within the dirty rect**
This is a separate problem from coordinate position. The Y-offset formula places the rectangle at the correct texture position, but the DATA rows within the dirty rect must also be in the correct order for the texture's orientation.

If the initial texture was uploaded with `flipY = true` (Three.js `CanvasTexture` default), GPU rows are stored bottom-to-top relative to canvas coordinates. A `texSubImage2D` call that provides rows in top-to-bottom canvas order (starting at `bbox.minY`) will store them in the wrong orientation for all rows except the first — the dirty rect will appear vertically flipped relative to the surrounding texture.

The fix for raw TypedArray sources: provide data starting from `(bbox.maxY * width + bbox.minX) * 4` with rows in bottom-to-top canvas order. Since `UNPACK_ROW_LENGTH` does not support negative strides, the cleanest approach is to wrap the sub-rect in an `ImageData` and pass it as a TexImageSource — then `UNPACK_FLIP_Y_WEBGL = 1` applies and corrects the row order automatically.

**[ ] `UNPACK_FLIP_Y_WEBGL` applies only to TexImageSource types**
`UNPACK_FLIP_Y_WEBGL` applies only to TexImageSource inputs: ImageData, HTMLCanvasElement, HTMLVideoElement, ImageBitmap. It does NOT apply to raw TypedArray (Uint8ClampedArray, Uint8Array, etc.) sources. Any code sketch that sets `UNPACK_FLIP_Y_WEBGL = 1` and then provides a TypedArray expects automatic row flipping that will not occur. Verify whether the sketch's source argument is a TexImageSource or a TypedArray.

**[ ] Three.js `CanvasTexture.flipY` default**
`THREE.CanvasTexture` inherits from `Texture`, which defaults `flipY = true`. Unless the code explicitly sets `_texture.flipY = false`, the initial texture upload stores canvas data bottom-to-top in GPU memory. Any `texSubImage2D` skip must match this orientation. Verify the source file for an explicit `flipY` assignment; absence means `flipY = true`.

**[ ] UNPACK_ROW_LENGTH is WebGL2-only**
Before relying on `gl.UNPACK_ROW_LENGTH`, confirm the renderer was initialized in WebGL2 mode. This parameter does not exist in WebGL1.

**[ ] ImageData + SharedArrayBuffer construction path**
You cannot retroactively make an existing `ImageData`'s backing store a SAB. The SAB must be allocated first: `new ImageData(new Uint8ClampedArray(new SharedArrayBuffer(w * h * 4)), w, h)`. Any SCOPE text that implies the existing `ImageData` can be "switched" to SAB is incorrect.

**[ ] Independent buffer copies vs shared views**
Verify whether `displayImageData.data` shares memory with `registry.sourceBuffer`. If the current code uses `.slice()` to create an independent copy (check `MapRenderer` constructor), then SAB-backing requires two separate allocations — one for `sourceBuffer`, one for `displayImageData.data`. They are not the same buffer.

**[ ] `toHexKey` allocation count**
The O(W×H) scan calls `toHexKey` up to 3 times per pixel: once for the current pixel, once for the right neighbor, once for the bottom neighbor. The allocation count is ~3× pixel count, not 1×. Verify any quoted figure.

**[ ] `@deprecated` annotations**
Before describing work to deprecate a property, check if it is already annotated `@deprecated` (and possibly `@experimental`) in the source. If it is, the task is to lazify or remove it — not to add deprecation markers.

**[ ] "Tests pass unchanged" — four failure sub-patterns**
Before writing "tests pass unchanged" for any refactor, read the specific test file for that module and check all four sub-patterns:

1. **Map/array structural access:** If any test directly calls `.get()`, `.has()`, array indexing, or object property access on a data structure being replaced, those tests will break. The correct language is: "The `MapEngine` consumer API tests pass unchanged; `SectorRegistry` structural-property tests are intentionally updated to match the new TypedArray API."

2. **Type-change breaks typed assertions:** If a field changes from `number` to `bigint`, any test using `toBeCloseTo(value, precision)` or arithmetic comparison on that field will fail — BigInt is not a Number. Check for `toBeCloseTo`, numeric comparisons, and arithmetic on ALL fields whose TYPE is changing, including private fields accessed via bracket notation (e.g., `clock['_accumulator']`).

3. **`toBe` reference equality on rebuilt objects:** `toBe` tests object identity, not equality. If a test asserts `expect(a).toBe(b)` where `a` is returned by a method and `b` is accessed directly from a property, and the refactor means the method now constructs a new object (rather than returning the property's own reference), the assertion breaks even if the content is identical. `toEqual` would survive; `toBe` will not. Check every `toBe` assertion on structured values in tests that cover refactored code paths.

4. **Write-path removal exposes side-effect assertions:** If a deliverable removes or replaces a write operation whose side effect is separately tested, those side-effect assertions silently fail. Example: removing `texture.needsUpdate = true` removes the Three.js setter call that increments `texture.version`; any test asserting `expect(texture.version).toBeGreaterThan(before)` will fail even though the visual output is correct. Before claiming "tests pass unchanged" for any deliverable that removes a write path, scan all test files for assertions on the downstream side effects of that write.

**[ ] GameClock constructor dependency**
`GameClock` takes a `MapEngine` instance in its constructor and hooks into the frame system via `engine.onFrame()`. Any deliverable that moves `GameClock` to a Worker must first break this coupling. The SCOPE must list decoupling as an explicit prerequisite step, not imply it is automatic.

**[ ] BigInt accumulator — speed multiplier composition**
When replacing a float accumulator with BigInt microseconds, the `_speed` multiplier (a float) must be applied BEFORE the BigInt conversion — not after. The correct form is `BigInt(Math.round(dt * this._speed * 1e6))`. Applying speed as a BigInt multiplication afterward loses sub-integer precision for speeds like 0.5× or 2.5×. Verify any BigInt accumulator sketch for this pattern.

**[ ] Constructor arity discrepancy between source and tests**
Verify that test files construct each class with the same number and type of arguments the actual constructor requires. TypeScript type errors are not caught by Vitest's browser mode (esbuild transpilation). If tests omit required arguments, the missing parameter is `undefined` at runtime — this silently works if the code has a falsy guard, but breaks if the constructor is later made strict about that parameter. Any deliverable that adds new constructor-level state (flags, SAB references, etc.) must account for test-file construction patterns that omit arguments.

**[ ] Two dirty-rect paths, not one**
`MapEngine` has two code paths that ultimately dirty the GPU texture:

1. The immediate path: `MapEngine.setSectorColor` → `MapRenderer.setSectorColor` → `putImageData` + `texture.needsUpdate = true`.
2. The batched path: `MapEngine.setSectorColor` (during tick) → `_patchSectorPixels` → accumulates `_pendingDirtyRect` → `_flushPendingDirty` → `putImageData` + `texture.needsUpdate = true`.
   Any optimization to the GPU upload (e.g., `texSubImage2D`) must be applied to BOTH paths.

**[ ] `texture.needsUpdate = true` removal — side effects on `_texture.version` assertions**
`THREE.Texture` increments `this.version` via its `needsUpdate` setter. Any deliverable that replaces `texture.needsUpdate = true` with direct `gl.texSubImage2D` calls (e.g., A4) bypasses this increment entirely. Before claiming "tests pass unchanged" for such a deliverable, search all test files for `_texture.version` (or `.version`) assertions — both `expect(x.version).toBeGreaterThan(before)` and `expect(x.version).toBe(n)` forms. These will silently fail after the `needsUpdate` path is removed. See sub-pattern 4 above; this is a concrete instance of write-path removal exposing a side-effect assertion.

**[ ] V-number and Pillar reference consistency**
The SCOPE defines Pillar I–VII in Section 2 and V1–V20 in Section 4.1. Every "Pillar N" and "VN" reference in Sections 5–9 must resolve to the correct numbered entry. Common failures: a deliverable spec cites "Pillar IV" for a non-rendering concern, or a V-number in a deliverable heading (e.g., "B2 / V7") does not match the entry in the scoring table. Scan every Pillar and V-number reference in the auditable body and verify it points to the right item in Sections 2 and 4.1. Also verify that each deliverable's placement in Phase A (Momentum Targets) or Phase B (Structural Targets) matches its matrix categorization in Section 4.2.

**[ ] "Intentionally updated" test claims must be complete, not just accurate**
The SCOPE explicitly names specific test assertions that will intentionally break (e.g., the five `clock['_accumulator']` accesses in `GameClock.test.ts`, the `_texture.version` assertion in `FrameHook.test.ts AC 1.3`). These named assertions must actually exist in the test files at the cited lines — but the list must also be _complete_. There may be additional uncited occurrences of the same access pattern elsewhere in those files. Before accepting the SCOPE's "intentionally updated" list as definitive, search the full test file for all occurrences of the accessed field or write-path side effect. An uncited intentional break is a hidden failure left for the implementer to discover.

**[ ] SCOPE "preserved" claims are assertions to verify, not facts to accept**
When the SCOPE explicitly says a data structure or test suite is "preserved" or "passes unchanged", this is the SCOPE's claim — verify it against the actual test files. A common failure: the SCOPE correctly lists some structures as changed (bboxes, centroids, pixelIndices) but omits others (e.g., adjacency) that are equally changed, because the author overlooked tests that access them. Every structure that changes shape must be audited against every test file, even if the SCOPE asserts it is safe.

---

## Phase 6 — Write the Revised SCOPE_STATEMENT.md

After completing Phases 1–5, produce the revised `docs/performance-refactor/SCOPE_STATEMENT.md`.

**Rules:**

- Only write to `docs/performance-refactor/SCOPE_STATEMENT.md`. No other files may be created or modified.
- Preserve the document's section structure (Sections 1–9 plus any subsections from the current version). Restructure only when necessary for clarity.
- For each change, the change must be traceable to a specific finding from the audit (a line in the code, a test assertion, a property type, etc.).
- Do not add speculation. Every added fact must be verifiable in `src/` or `test/`.
- Do not modify Sections 2–4 (Core Engineering Mandates, Evidence Base, Leverage Analysis) unless a codebase finding directly contradicts a factual claim in those sections (e.g., a property type mismatch, an incorrect cross-reference). Direction decisions in those sections are not revisable through code inspection alone.
- When inserting content into an existing section, place it adjacent to the most related existing text so the document reads naturally without requiring the reader to cross-reference distant paragraphs.
- When adding test-break acknowledgments to acceptance criteria, be explicit about WHICH tests are intentionally updated vs. which pass unchanged. Imprecise language that groups both categories together is itself a defect.

**Fix priority (in order):**

1. **Acceptance criteria that are factually impossible** (e.g., tests that WILL break being called "unchanged"; `toBe` assertions on rebuilt objects; `toBeCloseTo` on type-changed fields).
2. **Implementation sketches that are wrong** (wrong row order, wrong API, wrong Y-axis, wrong buffer model, wrong accumulator composition).
3. **Missing architectural context** that would cause an agent to build something incompatible with the existing system (e.g., the `_preRenderHook` topology, the batched dirty-rect system, constructor couplings, Three.js `flipY` default).
4. **Data layout inconsistencies** (e.g., SoA described but jagged arrays specified; CSR described for adjacency but not for pixel indices).
5. **Imprecise "public API" language** that conflates the consumer surface with internally-tested structural properties, or conflates `toBe`-tested references with `toEqual`-tested values.
6. **Missing fragility warnings** for internal APIs, version pinning requirements, browser prerequisites, and WebGL pixel-store state interactions.
7. **Minor clarifications** — phrasing, precision, completeness.
