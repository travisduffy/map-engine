# Canonical Project Scope Statement

**Document Status:** Final
**Date Generated:** April 22, 2026

## 1. Project Purpose & Justification

The WIP `map-engine` prototype violates the core engineering mandates across the rendering, memory, and temporal pillars, as identified by convergent findings from ten independent engineering reviews and confirmed by direct code inspection. This project exists to bring the codebase into compliance with the mandated architecture — deterministic discrete-state simulation, normalized SoA state, zero-copy WASM/SAB memory bridging, GPU-as-translator index-map rendering, and Off-Main-Thread concurrency — by executing a dependency-ordered refactor sequence that unblocks every downstream pillar (including multiplayer lockstep) from a shared memory-layout foundation.

## 2. Core Engineering Mandates

These are the seven architectural pillars that all implementation decisions in this project must satisfy. All "Pillar N" references throughout this document refer to the numbered items below.

**1. Temporal Serialization & Determinism (Pillar I)**

- Enforce a perfectly deterministic, discrete-state automaton. The simulation must be completely decoupled from the rendering frame rate using a fixed-step temporal accumulator.
- Absolutely forbid IEEE 754 floating-point arithmetic for state-critical math; demand fixed-point mathematics or 64-bit integers to prevent cross-platform determinism drift.
- Ensure that given the same initial seed and inputs, the simulation produces the exact same bitwise state outcome on any CPU architecture.

**2. State Management & Concurrency (Pillar II)**

- Utilize a heavily normalized Entity-Component-System (ECS) or relational entity registry backed by contiguous memory arrays to maximize CPU cache coherency.
- Implement a strict Two-Phase "Read-Lock / Write-Lock" concurrency model. During the Read-Lock phase, parallel worker threads evaluate data (AI, modifiers) with strictly read-only access, storing results in local delta buffers. During the Write-Lock phase, the global state is mutated sequentially to maintain lockstep determinism.

**3. Memory Architecture & JavaScript/WASM Boundary (Pillar III)**

- Bypass the V8 JavaScript engine's 4GB memory cage and garbage collector (GC) by allocating the entire game state inside WASM linear memory.
- Mandate a zero-copy memory bridge using `SharedArrayBuffer` (SAB). The UI must read state via JavaScript `TypedArray` views draped directly over the SAB, synchronized via non-blocking `Atomics.waitAsync`.
- For UI-to-Engine interaction, implement a Wait-Free Ring Buffer using a bitwise-packed binary payload (e.g., 64-bit standardized integers) to serialize human intents over the SAB without JSON serialization or garbage collection pauses.

**4. Rendering & Map Architecture (Pillar IV)**

- Treat the map not as a 3D physical space, but as an "RGB Index-Map" spatial database. Every pixel is an exact 24-bit RGB hex value that mathematically translates to a province ID.
- Enforce absolute pixel immutability for the index map: disable anti-aliasing, mipmapping, and block compression (DXT/ASTC), and mandate strict `gl.NEAREST` filtering.
- Resolve GPU PCIe upload bottlenecks by avoiding `gl.texImage2D` reallocation; mandate `gl.texSubImage2D` and Pixel Buffer Objects (PBOs) for delta state updates.
- Implement WebGL2 texture chunking (`TEXTURE_2D_ARRAY`) to bypass mobile device `gl.MAX_TEXTURE_SIZE` limits (e.g., 4096 limits). Resolve spatial lookups via GPU Read-Back Frame Buffer Objects (FBOs) mapping 1x1 pixel bounding boxes for instant province identification.

**5. Multiplayer & Networking (Pillar V)**

- Prioritize WebRTC Data Channels configured for unreliable/unordered UDP delivery to mitigate the Head-of-Line (HoL) blocking inherent to TCP WebSockets.
- Synchronize clients using deterministic lockstep (input delay buffers) combined with rollback netcode mechanics where applicable.
- Facilitate mid-session late-joining by serializing and transmitting a binary snapshot (using delta compression like XOR or zstd) of the entire WASM linear memory heap.

**6. User Interface — Svelte 5 Off-Main-Thread (Pillar VI)**

- Run the simulation kernel strictly inside a Web Worker. Adopt an Off-Main-Thread (OMT) architecture where UI diffing occurs in the worker, and only minimal primitive mutation instructions are sent to the main thread via `postMessage`.
- Utilize Svelte 5 (Runes / `$state`) for its compiler-driven, Virtual-DOM-free surgical reactivity to prevent massive memory churn and GC stalls during high-frequency data updates.
- Prevent layout thrashing by batching DOM reads/writes and enforce CSS Hardware Acceleration (`transform: translate3d`) for animated elements to bypass CPU layout and paint phases.
- Implement a Unidirectional Data Flow: the UI operates on a read-only "shadow state" and never mutates game data directly, ensuring temporal safety.

**7. AI & Modding Script Boundary (Pillar VII)**

- Structure AI using polynomial Utility Scoring Pipelines driven by Data-Driven Personality archetypes rather than brittle behavior trees.
- Prevent CPU frame stalling by load-balancing AI evaluations via modulo-based temporal scheduling (distributing evaluation ticks using `entity_id % interval`).
- Implement Cascading Arithmetic Aggregation Pipelines (Modifier DAGs) using dirty-flag caching and lazy evaluation.
- Embed QuickJS for the modding API, but compile mathematical JavaScript modifiers into Reverse Polish Notation (RPN) integer opcodes so they can be evaluated natively and deterministically in C++/WASM during the Read-Lock phase. Carefully manage reference pinning (`JS_DupValue` and `JS_FreeValue`) and use Tombstone Registries to prevent QuickJS GC leaks or cyclic references.
- Utilize non-Euclidean topological pathfinding (modified A\*) operating over regional nodes and dynamic edge weights to simulate strategic maneuvering.

## 3. Evidence Base

### 3.1 Executive Summary

Ten independent engineering reviews of the WIP `map-engine` codebase converge on a single verdict: the prototype violates the core mandates across rendering, memory, and temporal pillars. Strong consensus (8–10/10 reports) identifies three Pareto-dominant refactors: (1) eliminate full-texture GPU re-uploads by moving to either a shader-driven palette/index-map pipeline or direct `gl.texSubImage2D` dirty-rect uploads; (2) flatten `SectorRegistry`'s string-keyed Maps into contiguous SoA TypedArrays with integer province IDs; (3) isolate `GameClock` and simulation state into a Web Worker backed by a `SharedArrayBuffer` with a wait-free ring buffer. Two reports additionally surface high-value incremental wins (render-on-demand dirty flag, lazy `borderEdges`, fixed-point BigInt accumulator) that are lower-risk stepping stones. Execution should proceed in dependency order: memory flattening → temporal/determinism hardening → GPU pipeline overhaul.

### 3.2 Key Findings

**Theme A — Rendering pipeline is the largest single bottleneck**

- 9/10 reports flag the `texture.needsUpdate = true` path as forcing full `gl.texImage2D` re-uploads (tens of MB per color change) over PCIe, violating Pillar IV.
- Two competing solution shapes emerged: (a) full shader-based palette/index-map architecture (Reports 1, 3, 5, 7, 8, 10) — maximal impact, higher complexity; (b) minimal `gl.texSubImage2D` + `UNPACK_ROW_LENGTH` dirty-rect upload retaining existing CPU pipeline (Reports 2, 6) — lower risk, preserves current scaffolding.
- Reports 2 and 6 additionally identify an **unconditional `renderer.render()` in the rAF loop** as a separate, trivially-fixed waste (~95% of GPU submits on idle frames).
- Report 8 uniquely proposes FBO read-back for pointer picking, eliminating `THREE.Raycaster` and allowing `sourceBuffer` to be GC'd once uploaded.

**Theme B — State layout blocks every downstream mandate**

- 8/10 reports condemn `Map<string, ...>` + hex-string keys in `SectorRegistry`, citing GC churn, cache incoherence, and incompatibility with the mandated WASM/SAB bridge.
- Unanimous prescription: pack RGB into 32-bit integers (`(r << 16) | (g << 8) | b`), assign dense 0..N-1 province IDs, replace Maps with SoA TypedArrays (bboxes, centroids, pixelIndices, adjacency as CSR or `Uint32Array[]`).
- Reports 2 and 9 note that `toHexKey` in the O(W×H) constructor scan alone generates ~25M string allocations on a 4096×2048 map.
- Report 6 uniquely targets `borderEdges` eager allocation (~200–400 MB of GC-managed objects) on a deprecated API path — a hidden constructor cliff.

**Theme C — Temporal/concurrency model is not yet deterministic**

- 7/10 reports flag `GameClock` living on the main thread, coupled to `requestAnimationFrame`, as violating Pillars I and VI.
- Reports 4 and 9 specifically call out IEEE 754 floats in the accumulator as the literal source of cross-platform drift; both prescribe BigInt microsecond fixed-point (~15 LOC change, zero API break).
- Reports 1, 3, 5, 7, 8, 10 push the larger refactor: relocate the clock into a Web Worker, add a SAB-backed wait-free ring buffer for bit-packed input intents (typically 64-bit words: opcode + sector ID + payload).

**Theme D — Memory bridge (SAB/WASM readiness)**

- Reports 4 and 9 identify a near-zero-risk incremental step: allocate `sourceBuffer` / `displayImageData` over a `SharedArrayBuffer` today, preserving all existing code paths while unlocking the future WASM transfer with no API change.
- Report 3 pushes further: flatten adjacency into CSR format now to enable native cache-coherent pathfinding later.

**Theme E — Three.js as long-term liability (divergent)**

- Reports 5 and 8 advocate stripping Three.js entirely for raw WebGL2, citing bundle size, GC churn from matrix allocations, and lack of low-level control (PBO, `TEXTURE_2D_ARRAY`).
- Reports 1, 2, 6, 10 treat Three.js as retainable via `ShaderMaterial` + `DataTexture` + direct GL handle access — a pragmatic stepping stone.
- No consensus; this is a strategic branch point requiring a BDFL decision.

### 3.3 Cross-Analysis

| Rank | Factor                                            | Evidence (Report IDs)                 | Confidence | Note                                                                                        |
| ---- | ------------------------------------------------- | ------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| 1    | Full-texture GPU re-upload on every color change  | 1, 2, 3, 5, 6, 7, 8, 10               | 98%        | Universally identified; two viable fix shapes (shader palette vs. `texSubImage2D`)          |
| 2    | String hex keys + `Map<string,...>` in hot paths  | 1, 2, 3, 4, 7, 8, 9, 10               | 97%        | Blocks WASM bridge; unanimous prescription (integer IDs + SoA)                              |
| 3    | `GameClock` on main thread, coupled to rAF        | 1, 3, 5, 7, 8, 10                     | 92%        | Violates Pillars I & VI; Worker isolation is the fix                                        |
| 4    | IEEE 754 accumulator causing cross-platform drift | 4, 9                                  | 88%        | Narrow but foundational; BigInt µs fix is ~15 LOC                                           |
| 5    | Unconditional `renderer.render()` every frame     | 2, 6                                  | 85%        | Lowest-complexity, highest-immediate-ROI win; prerequisite for #1's `texSubImage2D` variant |
| 6    | Lack of SAB backing for pixel buffers             | 3, 4, 9, 10                           | 82%        | Enables zero-copy without changing existing code paths                                      |
| 7    | `borderEdges` eager allocation (deprecated API)   | 6                                     | 70%        | Single-report finding but numerically significant (200–400 MB)                              |
| 8    | CPU raycasting for spatial lookup                 | 8                                     | 65%        | Single-report finding; strong logical case, enables `sourceBuffer` GC                       |
| 9    | Three.js retention vs. raw WebGL2                 | 5, 8 (strip) vs. 1, 2, 6, 10 (retain) | 50%        | Genuinely contested; defer decision behind a boundary abstraction                           |

### 3.4 Root-Cause Hierarchy

1. **Memory model mismatch** (95%) — The state layer was built with V8-idiomatic GC-managed objects (`Map<string, ...>`, `Set<string>`, object graphs). Every downstream pillar (WASM bridge, determinism, OMT, cache coherency, zero-copy UI) requires contiguous integer-indexed TypedArrays. Fixing this unlocks or trivializes every subsequent refactor.
2. **Rendering architecture treats the GPU as a passive bitmap consumer** (92%) — CPU iterates pixels, CPU mutates `ImageData`, CPU flushes the whole texture. The mandated model treats the bitmap as an immutable spatial index and the GPU as the translator via a palette shader. This is a conceptual inversion, not a tuning issue.
3. **Temporal and rendering threads are conflated** (85%) — Running the simulation accumulator inside `onFrame` guarantees that layout/paint stalls, GC pauses, and input-handler work will perturb tick timing. Deterministic lockstep is unachievable in this topology.
4. **No memory boundary between UI and simulation** (80%) — Absent a SAB, every future improvement requires `postMessage` serialization. Introducing SAB early (even before the Worker move) is near-free insurance.

### 3.5 Report Synopses & Methodology

**Report synopses:**

- **R1** — Prescribes shader palette + SoA SAB arrays + OMT ring buffer; asks whether to strip Three.js.
- **R2** — Narrow, high-precision: `texSubImage2D` with `UNPACK_ROW_LENGTH`, render-on-demand flag, `packRgb` internal keys; preserves Three.js.
- **R3** — Maximalist: GPU palette, WASM linear memory + CSR adjacency, Worker kernel with SAB ring buffer.
- **R4** — Incremental/low-risk: SAB-back existing buffers, BigInt fixed-point `GameClock`, numeric province IDs — all zero-API-break.
- **R5** — Aggressive: shader palette, Worker clock, strip Three.js for raw WebGL2.
- **R6** — Surgical: render-on-demand flag, `texSubImage2D` via native GL handle, lazy `borderEdges` with packed Int16 backing.
- **R7** — Shader pipeline + SoA integer IDs + Worker ring buffer; asks for WASM language choice.
- **R8** — Shader palette + OMT/SAB + FBO read-back picking (uniquely enables `sourceBuffer` GC).
- **R9** — Dense ID SoA + SAB-backed buffers + BigInt clock; emphasizes <100 LOC total, zero breaking changes.
- **R10** — Shader palette + Worker-isolated clock + SoA `SectorRegistry` with integer IDs.

**Methodology:** Each report was parsed for (a) identified flaws with file/symbol references, (b) prescribed fixes, (c) claimed impact and complexity. Findings were cross-tabulated by theme and ranked by combined frequency and mandate-severity. Divergences (e.g., Three.js retention, incremental vs. maximalist rendering fix) are surfaced rather than resolved; single-report findings are included when the logical case is strong (R6 `borderEdges`, R8 FBO picking). Recommendations sequence dependencies: memory layout precedes concurrency precedes GPU pipeline, with two independent low-risk wins pulled forward. No report actually inspected the source code — all findings are reasoned from described symptoms. A focused code read may surface additional hot paths (e.g., the pan/zoom math, parser tier) not covered here.

## 4. Leverage Analysis

### 4.1 Variable Scoring

All implementation candidates were scored on Impact (1–10) and Complexity (1–10). The V-numbers used throughout Sections 5–8 are defined here.

| #   | Variable / Action                                                       | Impact | Complexity |
| --- | ----------------------------------------------------------------------- | ------ | ---------- |
| V1  | Render-on-demand dirty flag (gate `renderer.render()`)                  | 7      | 1          |
| V2  | BigInt µs fixed-point accumulator in `GameClock`                        | 8      | 2          |
| V3  | `SectorRegistry` flatten → integer IDs + SoA TypedArrays                | 10     | 6          |
| V4  | `SharedArrayBuffer` backing for `sourceBuffer` / `displayImageData`     | 7      | 2          |
| V5  | Lazy `borderEdges` getter over packed `Int16Array`                      | 5      | 2          |
| V6  | `gl.texSubImage2D` + `UNPACK_ROW_LENGTH` dirty-rect upload              | 8      | 3          |
| V7  | Full palette / index-map shader pipeline (`DataTexture` + fragment LUT) | 10     | 9          |
| V8  | Relocate `GameClock` + state to Web Worker behind SAB                   | 10     | 8          |
| V9  | Wait-free SAB ring buffer with 64-bit bit-packed intents                | 7      | 5          |
| V10 | `IRenderBackend` abstraction wrapping Three.js                          | 5      | 4          |
| V11 | Strip Three.js → raw WebGL2                                             | 6      | 9          |
| V12 | FBO read-back picking (retire `THREE.Raycaster`, free `sourceBuffer`)   | 6      | 5          |
| V13 | CSR adjacency representation                                            | 6      | 4          |
| V14 | WASM kernel language selection (C++/Rust/Zig)                           | 4      | 3          |
| V15 | `TEXTURE_2D_ARRAY` chunking for mobile `MAX_TEXTURE_SIZE`               | 5      | 6          |
| V16 | Two-phase Read-Lock / Write-Lock concurrency model                      | 8      | 8          |
| V17 | WebRTC DataChannels + rollback lockstep netcode                         | 7      | 9          |
| V18 | QuickJS → RPN integer opcode compiler                                   | 5      | 8          |
| V19 | Utility-score AI pipeline with modulo scheduling                        | 5      | 7          |
| V20 | Non-Euclidean regional-graph A\*                                        | 4      | 6          |

### 4.2 Matrix Categorization

Thresholds: Impact ≥ 7 = High; Complexity ≤ 4 = Low.

**Momentum Targets** (High Impact / Low Complexity): V1, V2, V4, V6

**Structural Targets** (High Impact / High Complexity): V3, V7, V8, V9, V16, V17

**Trivial Fillers** (Low Impact / Low Complexity): V5, V10, V13, V14

**Systemic Traps** (Low Impact / High Complexity): V11, V12, V15, V18, V19, V20

Note on V11 (Three.js strip): contested across reports; cost is high and the delta versus retaining Three.js behind V10 is marginal. It sits in the Trap quadrant until a spike proves abstraction insufficiency.

### 4.3 Dependency Map

Foundational node: **V3 (memory flattening)**. The meta-review explicitly identifies this as root-cause #1 — the V8-idiomatic `Map<string,...>` layout blocks every other Pillar. No Structural Target can proceed without it.

```
                  ┌──────────────────────────────┐
                  │  V3  SoA + integer province  │  ← foundation
                  │       IDs (SectorRegistry)   │
                  └──────────────┬───────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
    ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐
    │ V7 palette       │  │ V8 Worker +  │  │  (V13 CSR        │
    │    shader        │  │    SAB clock │  │   adjacency —    │
    │ (needs V4,V6)    │  │ (needs V2,V4)│  │   filler, fold   │
    └──────────────────┘  └──────┬───────┘  │   into V3)       │
                                 │          └──────────────────┘
                                 ▼
                         ┌──────────────┐
                         │ V9 ring-buf  │
                         │   intents    │
                         └──────┬───────┘
                                ▼
                         ┌──────────────┐
                         │ V16 2-phase  │
                         │  R/W lock    │
                         └──────┬───────┘
                                ▼
                         ┌──────────────┐
                         │ V17 rollback │
                         │   netcode    │
                         └──────────────┘
```

Prerequisite chain, enforced:

- V7 ← V3, V4, V6 (needs dense IDs, SAB backing, validated dirty-rect path)
- V8 ← V3, V2, V4 (can't ship state across a worker boundary with string-keyed Maps; determinism requires fixed-point clock first)
- V9 ← V8
- V16 ← V3, V8
- V17 ← V2, V8, V16

V11, V12, V15, V18, V19, and V20 are held deliberately out of the critical path. Reassess each only after B2 and B5 land — V12 (FBO picking) and V15 (texture chunking) become materially cheaper once V7 is in place and may exit the Trap quadrant at that point. V10 (a Trivial Filler) is the cheapest way to preserve optionality on V11 without committing to it; V12 is only viable once V7 ships and its index-map texture exists to read back from.

## 5. Scope Description

The authorized body of work is a two-phase structured refactor of the `map-engine` codebase. Phase A (Momentum Extraction) delivers four independently shippable, zero-API-break wins that eliminate the most embarrassing waste (idle GPU submits), remediate the most foundational determinism flaw (IEEE-754 drift), pre-position memory buffers for the SAB bridge, and capture the majority of PCIe savings without a shader rewrite. Phase B (Structural Competence) executes six dependency-ordered foundational refactors beginning with `SectorRegistry` memory flattening (the root-cause node), proceeding through the palette-shader GPU pipeline, Web Worker relocation of `GameClock` and state, wait-free SAB ring buffer for input intents, two-phase read/write-lock concurrency, and terminating with WebRTC rollback-lockstep netcode. The scope boundary is defined by the dependency graph: no node may begin until its prerequisites are green.

## 6. Tangible Deliverables

### Codebase Architecture Context

Before reading individual deliverable specs, understand the existing frame-loop topology — it affects A1, A3, and A4 directly.

**The `_preRenderHook` system.** `MapEngine.loadMap()` injects a `hook` function into `MapRenderer` as `_preRenderHook`. The rAF loop calls it unconditionally before `renderer.render()` every frame. The hook: (1) computes `dt`; (2) sets `_inTick = true`; (3) iterates `_frameCallbacks` (which includes `GameClock._internalFrameCallback`); (4) sets `_inTick = false`; (5) calls `renderer._flushPendingDirty()`. After the hook returns, **a canvas size check runs in the rAF loop body** (comparing `canvas.clientWidth/clientHeight` against stored `_currentW/_currentH`; if changed, `renderer.setSize()` and the camera frustum are updated). Only then does `renderer.render(scene, camera)` execute — unconditionally, and as the last step in the callback. The render is not yet gated (A1's job). The resize check is therefore positioned between the hook return and the render call, not inside the hook. A1's dirty flag must be set within the resize branch and checked immediately before `renderer.render()` — after both the hook and the resize check have run.

**The batched dirty-rect system.** `MapEngine` exposes `setSectorColor` and `resetSectorColor`. When called during a frame tick (`_inTick === true`), they dispatch to `_patchSectorPixels` / `_patchSectorPixelsFromSource`, which accumulate a union bbox into `_pendingDirtyRect` without touching the GPU. When called outside a tick, they dispatch to the immediate `MapRenderer.setSectorColor` / `MapRenderer.resetSectorColor` path, which does a `putImageData` + `texture.needsUpdate = true` immediately. At end of tick, `_flushPendingDirty()` does a single `putImageData` (with the union bbox) + `texture.needsUpdate = true`. Both paths ultimately call `texture.needsUpdate = true`, which is what triggers Three.js to do a full `gl.texImage2D` re-upload from the OffscreenCanvas — that is the waste A4 eliminates.

**`displayImageData` is an independent copy.** In `MapRenderer`, `displayImageData` is constructed as `new ImageData(registry.sourceBuffer.slice(), width, height)`. The `.slice()` is intentional — `displayImageData.data` is independent of `registry.sourceBuffer`; mutations to display pixels do not alter the source index map. A3 needs to SAB-back these separately.

**`MapRenderer` constructor — pre-existing test discrepancy.** `MapRenderer.test.ts` constructs `new MapRenderer(canvas, registry)` throughout, omitting the `_preRenderHook` argument. The constructor parameter is non-optional in TypeScript but the tests run without it (Vitest transpiles without type-checking; `undefined` is falsy, so the `if (this._preRenderHook)` guard in the rAF loop skips it safely). Any deliverable that adds internal flags tested directly via `MapRenderer` must account for this: either make `_preRenderHook` explicitly optional in the constructor signature, or test the flag state by direct property inspection rather than triggering it through the hook.

---

### Phase A — Momentum Extraction (zero-API-break, independently shippable)

**A1 / V1 — Render-on-demand dirty flag gating `renderer.render()` inside the rAF loop (~10 LOC)**

Add a boolean dirty flag to `MapRenderer`. The flag is set to `true` whenever `_flushPendingDirty` actually flushes work (i.e., `_pendingDirtyRect !== null` on entry) and whenever the immediate `setSectorColor`/`resetSectorColor` path runs. The flag is also set on pan/zoom input events (the camera moved, so the scene needs a redraw) and whenever the canvas CSS size changes (the resize-check branch already fires inside the same rAF callback and must render the correctly-sized frame). `renderer.render(scene, camera)` at the bottom of the rAF loop executes only when the flag is `true`; the flag is cleared after render.

The initial frame must render unconditionally to paint the map — the flag should default to `true` at construction. Note: the flag must be checked AFTER `_preRenderHook()` returns (i.e., after frame callbacks and `_flushPendingDirty` have run), so that any mutations made during frame callbacks are captured in the same frame's render decision.

**A2 / V2 — BigInt microsecond fixed-point accumulator replacing the IEEE-754 accumulator in `GameClock` (~15 LOC)**

`GameClock._accumulator` (a `number`) and `_intervalSeconds` (a `number`) are the IEEE-754 targets. Replace both with integer microsecond values using `BigInt`. `_elapsed` is an integer tick counter (`number`) and does not need to change — only the sub-tick fractional accumulator causes cross-platform drift.

Implementation sketch: `_intervalUs: bigint = BigInt(Math.round(1e6 / tps))`, `_accumulatorUs: bigint = 0n`. In `_internalFrameCallback`, convert `dt` to microseconds as `BigInt(Math.round(dt * this._speed * 1e6))` and accumulate. The `_speed` multiplier must be applied before the BigInt conversion — applying speed as a separate BigInt multiplication afterward loses sub-integer precision for non-integer speeds (0.5×, 2.5×, etc.). The tick loop compares `_accumulatorUs >= _intervalUs`. The `elapsed` getter remains a `number`.

**Test update required:** `GameClock.test.ts` directly accesses the accumulator field as a floating-point value across five test cases (six assertion lines) and asserts it with `toBeCloseTo`. Renaming and retyping the accumulator to BigInt will break these assertions — both the property name and the comparison type will no longer match. These five test cases (six assertions) must be updated to access `clock['_accumulatorUs']` (or `testClock['_accumulatorUs']` in AC 2.9) and compare against BigInt microsecond values. Note: AC 2.2 contains two assertions in one `it()` block; AC 2.9 uses a local variable named `testClock` rather than `clock`.

- AC 2.1b line 82: `expect(clock['_accumulator']).toBeCloseTo(0, 10)`
- AC 2.2 line 90: `expect(clock['_accumulator']).toBeCloseTo(0.5, 10)`
- AC 2.2 line 97: `expect(clock['_accumulator']).toBeCloseTo(0.5, 10)` ← second assertion, same `it()` block
- AC 2.5a line 161: `expect(clock['_accumulator']).toBeCloseTo(0, 10)`
- AC 2.5b line 172: `expect(clock['_accumulator']).toBeCloseTo(0.5, 10)`
- AC 2.9 line 242: `expect(testClock['_accumulator']).toBeCloseTo(0.5, 10)` ← uses `testClock` variable

This is an intentional internal-API change, analogous to B1's structural-property test updates. The "zero API break" guarantee covers the public `MapEngine` consumer surface and `GameClock`'s own public interface (`elapsed`, `speed`, `paused`, `pause()`, `resume()`, `setSpeed()`, `onTick()`, `offTick()`, `destroy()`) — not the private IEEE-754 accumulator field.

**A3 / V4 — `SharedArrayBuffer` backing for `sourceBuffer` and `displayImageData`, preserving existing TypedArray view call sites**

`registry.sourceBuffer` (`Uint8ClampedArray`) must be backed by a `SharedArrayBuffer`. `SectorRegistry` currently stores the buffer reference passed into its constructor; `SectorBitmapParser.parse()` returns the `imageData.data` from an `OffscreenCanvas` `getImageData()` call. To SAB-back this, allocate a `SharedArrayBuffer` of the same byte length, copy the `getImageData()` result into it, and return a `Uint8ClampedArray` view over the SAB instead.

`displayImageData` in `MapRenderer` is created as `new ImageData(registry.sourceBuffer.slice(), width, height)`. To SAB-back `displayImageData.data`, the `ImageData` constructor must receive `new Uint8ClampedArray(new SharedArrayBuffer(width * height * 4))` as its data argument — you cannot retroactively change the backing store of an existing `ImageData`. All existing call sites read/write `displayImageData.data[offset]` as a `Uint8ClampedArray` and will continue to work unchanged.

**COOP/COEP headers are a hard prerequisite.** `SharedArrayBuffer` is only available in cross-origin-isolated contexts (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`). Audit the hosting environment before merging A3; downstream Phase B work also depends on this.

**A4 / V6 — `gl.texSubImage2D` + `UNPACK_ROW_LENGTH` dirty-rect upload path, reached via Three.js `WebGLRenderer.properties` native GL handle access (~40 LOC)**

There are two existing dirty-rect paths (see Architecture Context above). Both currently end with `texture.needsUpdate = true`, which causes Three.js's CanvasTexture machinery to call `gl.texImage2D` on the full OffscreenCanvas — an O(W×H) upload regardless of the dirty area. A4 replaces that full re-upload with `gl.texSubImage2D` on the exact dirty rectangle.

Implementation approach: after `putImageData` writes to the OffscreenCanvas 2D context (keeping it in sync), instead of setting `texture.needsUpdate = true`, retrieve the native GL texture handle via `renderer.properties.get(this._texture).__webglTexture` (Three.js internal API — pin the Three.js version), then call `gl.texSubImage2D`.

**Y-axis and row-order requirements (critical correctness detail):** Three.js's `CanvasTexture` uses `flipY = true` by default, which means the initial `texImage2D` upload stores canvas rows in bottom-to-top order in the GPU texture (canvas row 0 = top → GPU texture bottom; canvas row height−1 = bottom → GPU texture top). The dirty-rect update via `texSubImage2D` must match this orientation on both axes:

1. **Y offset (coordinate position):** The `yoffset` parameter must be the WebGL coordinate of the bottom of the dirty rect: `yoffset = height - bbox.maxY - 1`. This is the correct formula.

2. **Row order within the dirty rect (data orientation):** For raw TypedArray sources, `UNPACK_FLIP_Y_WEBGL` does not apply per the WebGL spec (it applies only to TexImageSource types: ImageData, HTMLCanvasElement, HTMLVideoElement, ImageBitmap). The data rows must therefore be provided in bottom-to-top canvas order explicitly. The recommended approach is to wrap the sub-rect in a new `ImageData` — either by creating one from scratch with the extracted pixels, or by using `createImageBitmap` with crop options — and pass the `ImageData` to `texSubImage2D` (then `UNPACK_FLIP_Y_WEBGL = 1` applies automatically). This is cleaner than manually reversing rows in-place.

Illustrative call (assuming an `ImageData` source for the dirty sub-rect):

```
// 'renderer' below refers to this.renderer — the THREE.WebGLRenderer instance property of MapRenderer
const gl = renderer.getContext() as WebGL2RenderingContext
const glTexture = renderer.properties.get(this._texture).__webglTexture
gl.bindTexture(gl.TEXTURE_2D, glTexture)
// Build or extract the sub-rect as an ImageData (rows in canvas/top-to-bottom order)
// Pass it as an ImageData source — UNPACK_FLIP_Y_WEBGL = 1 applies automatically:
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)  // must be set explicitly; Three.js may reset it
gl.texSubImage2D(gl.TEXTURE_2D, 0,
  bbox.minX,
  height - bbox.maxY - 1,           // WebGL yoffset = bottom of dirty rect
  gl.RGBA, gl.UNSIGNED_BYTE,
  subRectImageData)                  // ImageData source, canvas row order, UNPACK_FLIP_Y applies
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0)  // reset to Three.js default
```

If using a raw TypedArray source instead of ImageData (for zero-copy), rows must be provided in bottom-to-top canvas order (from `bbox.maxY` down to `bbox.minY`). `UNPACK_ROW_LENGTH` can still be used for the row stride, but the starting byte offset must point to the bottom of the dirty rect: `(bbox.maxY * width + bbox.minX) * 4`.

**Additional gotchas:** (1) `UNPACK_ROW_LENGTH` is WebGL2-only — verify the renderer is in WebGL2 mode. (2) `__webglTexture` is a Three.js internal; it is not part of the public API and may change across Three.js versions — this is an intentional trade-off per the engineering reviews. (3) The OffscreenCanvas `putImageData` call is still needed to keep the 2D canvas in sync (for any future reads); what changes is that `texture.needsUpdate` is never set to `true` again. (4) Apply the fix to BOTH dirty-rect paths: the immediate `MapRenderer.setSectorColor`/`resetSectorColor` path AND the batched `_flushPendingDirty` path.

---

### Phase B — Structural Competence (critical path, strictly dependency-ordered)

**B1 / V3 — `SectorRegistry` flattened to SoA `Uint32Array` / `Int32Array` layout with dense 0..N-1 integer province IDs, bidirectional hex ↔ `Uint32` lookup table preserving the public API, and V13 (CSR adjacency) plus V5 (lazy `borderEdges` over packed `Int16Array`) folded into the same pass**

V13 (CSR adjacency) is a Trivial Filler that is free to implement during B1 and expensive to retrofit later — fold it into this pass. V5 (lazy `borderEdges`) touches the same file and eliminates a 200–400 MB hidden constructor cliff on a deprecated API path; fold it in here as well.

The public API that must remain backward-compatible is the `MapEngine` consumer surface: `loadMap`, `setSectorColor`, `resetSectorColor`, `getSector`, `getSectorKeys`, `getNeighbors`, and the `sectorHover`/`sectorClick` events (which pass `PickResult` with a hex-key string). The `getSectorAt` → hex-string path must also be preserved.

**Structural properties that WILL change shape:** The following properties, exposed as `Map<string, …>` today, will change to TypedArray / CSR form as part of B1:

- `registry.bboxes` — changes from `Map<string, SectorBBox>` to `Int32Array` (stride-4)
- `registry.centroids` — changes from `Map<string, { x, y }>` to `Float32Array` (stride-2)
- `registry.pixelIndices` — changes from `Map<string, Uint32Array>` to CSR pair (`pixelData: Uint32Array`, `pixelOffset: Uint32Array`)
- `registry.adjacency` — changes from `ReadonlyMap<string, ReadonlySet<string>>` to CSR pair (`adjData: Uint32Array`, `adjOffset: Uint32Array`)
- `registry.borderEdges` — changes from eager `BorderEdge[]` to a lazy getter backed by a packed `Int16Array`

**Tests that will be intentionally updated:** The following test files directly call Map methods (`.get()`, `.has()`, `.values()`, `.size`) on `bboxes`, `centroids`, `pixelIndices`, or `adjacency` and will need updating to match the new TypedArray-indexed / CSR API:

- `SectorRegistry.test.ts` — asserts `registry.bboxes.get(key)` (multiple), `registry.centroids.get(key)` (multiple), `registry.pixelIndices.get(key)` (multiple), `registry.bboxes.has(key)` (mismatch fixture test)
- `AdjacencyGraph.test.ts` — asserts `registry.adjacency.get(key)`, `registry.adjacency.has(key)`, `registry.adjacency.values()`, set `.size`, set `.has()`; also AC 3.6a asserts reference equality `engine.getNeighbors('ff0000') === engine.registry.adjacency.get('ff0000')` via `toBe` — this reference-equality assertion must change because `getNeighbors` will build a `ReadonlySet<string>` from the CSR data rather than returning a pre-existing Set object, and `registry.adjacency.get()` no longer exists on the CSR pair
- `FrameHook.test.ts` — accesses `registry.bboxes.get('ff0000')!.maxX` and `registry.pixelIndices.get(key)![0]`

**`borderEdges` behavioral assertions pass unchanged.** `registry.borderEdges` changes from an eagerly-allocated `BorderEdge[]` property to a lazy getter, but the getter's return type is still `BorderEdge[]`. All existing assertions that call `registry.borderEdges.length`, index it (`[n].sectorA`, `[n].direction`), iterate it, `.filter()` it, or use `.toContainEqual()` / `.toMatchObject()` on its elements operate on the returned array and do not break. No test in `SectorRegistry.test.ts` or `AdjacencyGraph.test.ts` needs updating for `borderEdges` alone.

**`MapRenderer.ts` and `MapEngine.ts` also require updating.** `MapRenderer.ts` calls `this._registry.pixelIndices.has()`, `.get()`, and `this._registry.bboxes.get()` in `setSectorColor`, `resetSectorColor`, `_patchSectorPixels`, `_patchSectorPixelsFromSource`, and `_flushPendingDirty`. All these call sites must be rewritten to use the new CSR API. `MapEngine.ts` must also be updated: `getNeighbors` currently calls `this._registry!.adjacency.get(hexKey)` (line 293) which will not exist on the CSR pair after B1; it must be rewritten to look up the province ID via `hexToId`, walk the `adjData`/`adjOffset` CSR slice, and construct a `ReadonlySet<string>` of hex keys on demand. Neither `MapRenderer.test.ts` nor `MapEngine.test.ts` / `AdjacencyGraph.test.ts`'s behavioral assertions (`getNeighbors` content, not reference) break as long as these implementations are correct.

These test updates are expected, intentional breaks to the structural layer.

**`MapRenderer.test.ts` passes unchanged.** `MapRenderer.setSectorColor`, `resetSectorColor`, `_patchSectorPixels`, and `_patchSectorPixelsFromSource` all call `this._registry.pixelIndices.has(hexKey)` and `.get(hexKey)` internally, so `MapRenderer.ts` itself must be updated to use the new CSR API. However, `MapRenderer.test.ts` asserts only on behavioral outcomes — pixel byte values in `displayImageData`, `console.warn` emissions — and does not assert on the shape of `pixelIndices` directly. As long as `MapRenderer.ts` is correctly updated, the test assertions pass without modification. The "zero API break" guarantee applies only to:

- The `MapEngine` consumer interface: `loadMap`, `setSectorColor`, `resetSectorColor`, `getSector`, `getSectorKeys`, `getNeighbors` (which continues to return a `ReadonlySet<string>` of hex keys, constructed from CSR data on demand)
- The `sectorHover`/`sectorClick` event payloads (`PickResult.hexKey`, `.sectorData`, `.pixelX`, `.pixelY`)
- The hex-string lookup methods: `getSectorAt`, `getSector`, `getSectorKeys`

**Target data layout:**

- Assign dense 0..N-1 integer province IDs. Build bidirectional lookup: `hexToId: Map<string, number>` (or a `Uint32Array` keyed by packed `(r<<16|g<<8|b)`) and `idToHexKey: string[]`.
- `bboxes: Int32Array` — stride-4 flat layout: `[minX_0, minY_0, maxX_0, maxY_0, minX_1, …]`, indexed by province ID.
- `centroids: Float32Array` — stride-2: `[x_0, y_0, x_1, y_1, …]`, indexed by province ID.
- `pixelIndices`: CSR layout using two flat arrays — `pixelData: Uint32Array` (all flat indices concatenated, sorted within each sector) + `pixelOffset: Uint32Array` of length N+1 (pixelOffset[i]..pixelOffset[i+1] is the range for province i). This is the same CSR pattern as adjacency.
- `adjacency`: CSR layout — `adjData: Uint32Array` (neighbor province IDs) + `adjOffset: Uint32Array` of length N+1.
- `borderEdges`: `borderEdges` is already marked `@deprecated @experimental` in the source (both `SectorRegistry.ts` and `types.ts`). Replace its eager `BorderEdge[]` allocation (which generates GC pressure proportional to map perimeter length) with a lazy getter backed by a packed `Int16Array` — each edge encoded as four `Int16` values (x, y, directionFlag, padding) plus two province IDs stored separately. The getter constructs the `BorderEdge[]` view on first access only.
- The O(W×H) scan currently calls `toHexKey` up to 3 times per pixel (current pixel + right neighbor + bottom neighbor). Replace with `(r<<16|g<<8|b)` integer packing (`packRgb`) as the hot-path key and use `hexToId` only for the public API boundary conversions.

**B1 gate before proceeding to B2/B3:** Constructor allocation profile drops >80% on the 4096×2048 fixture; public API test suite passes unchanged.

**B2 / V7 — Palette / index-map shader pipeline (`DataTexture` + fragment LUT), preceded by V10 (`IRenderBackend` abstraction wrapping Three.js) so the branch is a backend swap rather than a rewrite**

`IRenderBackend` does not exist yet; create it before starting the spike. The interface should wrap the Three.js renderer sufficiently to allow a raw-WebGL2 backend to be substituted. Time-boxed two-week spike on a branch validated against a 6k-province fixture prior to commit; Three.js retention vs. strip decision (V11) is explicitly resolved by the spike outcome.

**B2 may run in parallel with B3** — they touch disjoint files once V3 (B1) is done.

**B3 / V8 — Web Worker relocation of `GameClock` and state, UI reading via TypedArray views over a shared SAB**

`GameClock` currently takes `engine: MapEngine` as a constructor argument and hooks into the main-thread rAF loop via `engine.onFrame()` / `engine.offFrame()`. This coupling must be broken before the clock can move to a Worker. The B3 refactor must decouple the clock from `onFrame` — replacing it with a `MessageChannel` or direct Worker message protocol over SAB.

**B4 / V9 — Wait-free SAB ring buffer with 64-bit bit-packed intent words (opcode / sector ID / payload schema) as the canonical UI-to-engine mutation contract**

Bit-packing schema is formally specified as the API contract for all future UI mutations. Specify the schema explicitly (opcode bits, sector ID bits, payload bits) before implementation — this is a design artifact, not just code.

**B5 / V16 — Two-phase Read-Lock / Write-Lock concurrency model: parallel workers write to thread-local delta buffers during the Read phase; a sequential commit drains them during the Write phase**

Pillar II compliance — Read phase is strictly read-only with thread-local delta buffers; Write phase mutates global state sequentially.

**B6 / V17 — WebRTC DataChannels configured for unreliable/unordered delivery, combined with deterministic lockstep and rollback netcode**

Requires V2's deterministic clock, V3's serializable state, V8's worker isolation, and V16's phase discipline to all be green prior to commencement.

## 7. Acceptance Criteria (Definition of Done)

- **A1 (Render-on-demand dirty flag):** GPU submit rate drops to mutation-driven cadence; idle GPU submits are mutation-gated. First frame renders unconditionally (map is visible on load). Pan/zoom events mark the frame dirty. Canvas resize marks the frame dirty. All existing tests pass unmodified (no structural API touches in A1).
- **A2 (BigInt µs accumulator):** Replay tests produce bitwise-identical `GameClock.elapsed` values across Node and browser runtimes. `_accumulator` and `_intervalSeconds` are no longer IEEE-754 `number` types. The five `GameClock.test.ts` test cases that directly access `clock['_accumulator']` as a float (AC 2.1b, AC 2.2 ×2, AC 2.5a, AC 2.5b, AC 2.9) are intentionally updated to access `clock['_accumulatorUs']` and compare against BigInt microsecond values (see Section 6 A2 for exact line numbers). All other `GameClock` tests (public interface) pass unmodified.
- **A3 (SAB-backed pixel buffers):** All existing TypedArray read/write call sites on `displayImageData.data` and `registry.sourceBuffer` continue to function; no call-site modifications required. COOP/COEP headers confirmed in hosting environment. All existing tests pass unmodified.
- **A4 (`texSubImage2D` dirty-rect upload):** Per-color-change GPU transfer size drops from O(W×H) to O(dirty_area), profile-verified. Both the immediate `setSectorColor` path and the batched `_flushPendingDirty` path use the new upload. `texture.needsUpdate` is never set to `true` after A4 lands. Dirty-rect updates are visually correct (rows oriented consistently with the initial CanvasTexture upload — no Y-flip artifacts on multi-row dirty rects). All existing tests pass, with one intentional update: `FrameHook.test.ts AC 1.3` currently asserts `expect(renderer['_texture'].version).toBeGreaterThan(versionBefore)` — Three.js only increments `_texture.version` when `texture.needsUpdate = true` is set, which A4 removes permanently. This assertion must be updated as part of A4 to verify the flush behaviorally instead (e.g., assert that the `displayCtx.putImageData` spy already present in that test was called, or spy on `gl.texSubImage2D` directly).
- **Phase A global exit criteria:** Idle GPU submits are mutation-gated; `GameClock.elapsed` is bitwise-reproducible across Node and browser; per-color-change transfer size is O(dirty_area); all existing tests pass, with two narrowly scoped exceptions: (1) the five `GameClock.test.ts` internal-accumulator assertions (`clock['_accumulator']`) intentionally updated as part of A2; (2) `FrameHook.test.ts AC 1.3`'s `_texture.version` assertion intentionally updated as part of A4.
- **B1 (`SectorRegistry` flatten):** Constructor allocation profile drops by >80% on the 4096×2048 fixture. `toHexKey` / string allocations in the hot O(W×H) scan are eliminated in favor of integer packing. The `MapEngine` consumer API (events, `loadMap`, `setSectorColor`, `getSector`, `getSectorKeys`, `getNeighbors`, `sectorHover`/`sectorClick` payloads) passes unchanged. `MapEngine.getNeighbors()` continues to return a `ReadonlySet<string>` of hex keys. `SectorRegistry` structural-property tests for `bboxes`, `centroids`, `pixelIndices`, and `adjacency` in `SectorRegistry.test.ts`, `AdjacencyGraph.test.ts`, and `FrameHook.test.ts` are updated to match the new TypedArray/CSR API — these are intentional API changes, not regressions. `borderEdges` behavioral assertions (`length`, array indexing, `.filter()`, `.toMatchObject()`) pass unchanged because the lazy getter preserves the `BorderEdge[]` return type. `MapRenderer.test.ts` passes unchanged (it tests behavioral outcomes, not data structure shape).
- **B2 (Palette-shader pipeline):** Time-boxed two-week spike on a branch validated against a 6k-province fixture prior to commit; Three.js retention vs. strip decision (V11) is explicitly resolved by the spike outcome.
- **B3 (Worker relocation):** `GameClock` → `MapEngine` coupling via `onFrame` is broken. Simulation tick jitter decouples from main-thread jank under induced DOM load.
- **B4 (Ring buffer):** Bit-packing schema is formally specified as the API contract for all future UI mutations.
- **B5 (Two-phase R/W lock):** Pillar II compliance — Read phase is strictly read-only with thread-local delta buffers; Write phase mutates global state sequentially.
- **B6 (Rollback netcode):** Requires V2's deterministic clock, V3's serializable state, V8's worker isolation, and V16's phase discipline to all be green prior to commencement.

## 8. Project Exclusions (Out of Scope)

- **V11 — Strip Three.js to raw WebGL2:** Held out of the critical path; categorized as a Systemic Trap. V10 (`IRenderBackend` abstraction) is shipped instead to preserve optionality. Reassess only if the B2 spike proves Three.js abstractions obstruct PBO / `TEXTURE_2D_ARRAY` work.
- **V12 — FBO read-back picking:** Deferred until post-B2 reassessment. V12 reuses the same index-map texture that V7 introduces, eliminates the last CPU-side dependency on `sourceBuffer` (enabling its GC), and unblocks non-Euclidean map topologies — but none of these benefits exist until the palette-shader pipeline is in place. May exit the Trap quadrant once V7 ships.
- **V15 — `TEXTURE_2D_ARRAY` chunking for mobile `MAX_TEXTURE_SIZE`:** Deferred; reassess only after B2 and B5 land.
- **V18 — QuickJS → RPN integer opcode compiler:** Held out of the critical path.
- **V19 — Utility-score AI pipeline with modulo scheduling:** Held out of the critical path.
- **V20 — Non-Euclidean regional-graph A\*:** Held out of the critical path.
- **Three.js retention vs. strip decision:** Deferred behind the V10 boundary abstraction; not resolved within this scope until the B2 spike surfaces evidence.

## 9. Known Constraints & Assumptions

### Constraints

- Strict dependency ordering: V7 requires V3, V4, V6; V8 requires V3, V2, V4; V9 requires V8; V16 requires V3 and V8; V17 requires V2, V8, and V16. No node may begin until its prerequisites are green.
- Phase A deliverables must be zero-API-break at the `MapEngine` consumer surface and preserve all existing tests, with three narrowly scoped exceptions: (1) A2 intentionally updates six assertions across five `GameClock.test.ts` test cases that directly access the now-BigInt accumulator field — five use `clock['_accumulator']` (AC 2.1b, AC 2.2 ×2, AC 2.5a, AC 2.5b) and one uses `testClock['_accumulator']` (AC 2.9); (2) A4 intentionally updates the `FrameHook.test.ts AC 1.3` assertion that checks `_texture.version`, which relies on `texture.needsUpdate = true` being called; (3) B1 intentionally updates structural-property tests for `SectorRegistry` (`bboxes`, `centroids`, `pixelIndices`, `adjacency`) — `borderEdges` behavioral assertions pass unchanged since the lazy getter preserves the `BorderEdge[]` return type.
- B2 (palette-shader pipeline) is time-boxed to a two-week spike on a branch prior to commit.
- COOP/COEP headers are a hard prerequisite for `SharedArrayBuffer` usage (A3); hosting must be audited before merging A3.
- A4 uses `renderer.properties.get(texture).__webglTexture` — a Three.js internal API. Pin the Three.js version (`three@^0.160.0`) and do not upgrade it without re-validating the A4 implementation. This is an accepted trade-off per the engineering reviews analysis.
- A4 must explicitly manage `UNPACK_FLIP_Y_WEBGL` to match the initial CanvasTexture upload orientation (`flipY = true`). Using a raw TypedArray source bypasses automatic flip; the implementation must either use an `ImageData` source (for which `UNPACK_FLIP_Y_WEBGL` provably applies) or manually supply rows in bottom-to-top canvas order.
- `GameClock` constructor coupling to `MapEngine` via `onFrame` / `offFrame` must be resolved as the first step of B3, before any Worker relocation begins.

### Assumptions

- Target map dimensions are 4096×2048 with 1,000–6,000 provinces (the figure referenced across all reviews and used for cost estimates).
- COOP/COEP deployment is achievable (required for SAB-backed buffers in A3 and all downstream Phase B work).
- The `MapEngine` consumer API (events, `loadMap`, `setSectorColor`, `getSector`, `getSectorKeys`, `getNeighbors`) is the "zero API break" boundary. `SectorRegistry` structural properties (`bboxes`, `centroids`, `pixelIndices`, `adjacency`) are internal data layout — they change in B1. `borderEdges` changes backing store but preserves the `BorderEdge[]` getter return type, so behavioral tests pass unchanged. `GameClock`'s private accumulator field (`_accumulator`) is internal implementation — it changes in A2 (six assertions across five test cases updated). `MapRenderer`'s `_texture.needsUpdate` write path is internal implementation — it changes in A4, which requires updating the `_texture.version` assertion in `FrameHook.test.ts AC 1.3`.
- Test coverage on `SectorRegistry`'s public API is unverified; the "zero API break" claim for A3 and B1 assumes existing tests exercise the hex-key paths. This should be confirmed before the refactor begins.
- If any of the SAB deployment or target-dimension assumptions fail, V4 and V3 must be re-scored before proceeding.

### Unknowns Requiring Definition

- **Target browser/device profile:** Unspecified. Mobile-first targeting would materially increase the value of V15 (currently excluded) and A1.
- **Multiplayer timeline:** Unstated. If deterministic lockstep is imminent, A2 becomes blocking rather than incremental.
- **WASM kernel language (C++ / Rust / Zig):** Flagged as open by Report 7; affects memory-layout specifics of B1 but not its direction.
- **Budget and calendar timelines:** > _Requires Definition: No data provided in initial research._
- **Staffing, RACI, and ownership assignments:** > _Requires Definition: No data provided in initial research._
