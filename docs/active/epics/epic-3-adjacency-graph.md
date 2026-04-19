# Epic 3: The Adjacency Graph

**Objective:** Build a queryable, bidirectional, deduplicated neighbor map (`SectorRegistry.adjacency`) during the existing O(W×H) constructor scan, and expose it via `MapEngine.getNeighbors` — closing the gap between raw `borderEdges` data and a usable topology API for consumer game logic.
**Scope:** Incorporates PRD §3 (CA-2) and the Universal Example App Coverage requirement. Independent of Epics 1 and 2; can be implemented in parallel with the Epic 1 → Epic 2 sequence or after.

**Verifiable & Measurable Success Criteria:**

- **Bidirectionality and deduplication:** For any two definition-registered sectors sharing at least one orthogonally adjacent pixel pair, each is in the other's adjacency set, and each appears exactly once regardless of how many shared border pixels exist.
- **4-connectivity only:** Diagonal-only pixel contact does not constitute adjacency. Bitmap-only colors (no definition entry) appear neither as keys nor values in `adjacency`.
- **No second scan pass:** Adjacency write logic resides inside the same pixel-iteration block as the existing `borderEdges` logic — confirmed by code review.
- **`getNeighbors` proxy:** `engine.getNeighbors(hexKey)` returns the identical `ReadonlySet` reference (`===`) as `engine.registry.adjacency.get(hexKey)`. Guards throw `'MapEngine: destroyed'` / `'MapEngine: not loaded — call loadMap() first'` in the correct order.
- **Example app:** Clicking a sector at `localhost:3000` prints neighbor hex keys to `#neighbor-output` and highlights the neighbor sectors via `setSectorColor`, with prior neighbors reset on the next click — observable without DevTools.

---

## Tasks

### Task 3.1 — `SectorRegistry.adjacency` and Deprecations

**PRD Reference:** §3.1 (adjacency field, algorithm, `readonly` assignment rule); §3.3 (`borderEdges` and `BorderEdge` deprecation); PRD §"Architectural Principles" P-5 (no second scan pass)

Modifies `SectorRegistry` to build the adjacency map within the existing O(W×H) scan. **Read the v0.0.1 constructor in full before implementing** — the PRD requires confirming whether the pixel scan is inline or factored into a private helper (the `readonly` assignment must happen in the constructor body, not in a helper). This task has no dependency on Epics 1 or 2.

**Work:**

- Read `src/SectorRegistry.ts` in full before modifying. Determine whether the pixel scan is inline or factored into a private helper method. If factored, the helper must return the built adjacency map alongside any current return values; the constructor performs the final `this.adjacency = ...` assignment.
- Declare `readonly adjacency: ReadonlyMap<string, ReadonlySet<string>>` on `SectorRegistry`.
- Pre-scan step (after `_sectorMap` is populated from the definition, before the pixel loop):
  ```typescript
  const adjacencyMutable = new Map<string, Set<string>>()
  for (const hexKey of this._sectorMap.keys()) {
    adjacencyMutable.set(hexKey, new Set<string>())
  }
  ```
  This is O(S) over the sector dictionary — not a second bitmap scan, P-5 compliant.
- Inside the existing O(W×H) pixel loop, alongside the existing `borderEdges` logic:
  1. Derive `thisKey` via `toHexKey(r, g, b)` (already present for `borderEdges`; reuse the variable — do not re-decode RGB).
  2. If `thisKey` is not in `_sectorMap`, skip adjacency logic for this pixel (but `borderEdges` logic continues per v0.0.1 behavior — `borderEdges` runs for all pixels).
  3. Check right neighbor `(x+1, y)` if in bounds: derive `rightKey`. If `rightKey !== thisKey` AND `adjacencyMutable.has(rightKey)`: add bidirectional entries. **Reuse `rightKey` from the existing `borderEdges` derivation** if already computed at this position.
  4. Check bottom neighbor `(x, y+1)` if in bounds: same logic for `bottomKey`.
- Post-scan: `this.adjacency = adjacencyMutable as ReadonlyMap<string, ReadonlySet<string>>`. The explicit cast is required — TypeScript cannot widen `Map<string, Set<string>>` to `ReadonlyMap<string, ReadonlySet<string>>` implicitly.
- Add `@deprecated` JSDoc to `borderEdges` field in `SectorRegistry` (exact wording per PRD §3.3). Add `@deprecated` JSDoc to `BorderEdge` type in `src/types.ts`. Do not remove either or alter construction logic.

**Done when:** `npm run typecheck` passes; a `SectorRegistry` built from the 4×4 test fixture has `adjacency` with 4 entries; `adjacency.get('ff0000')` contains `'00ff00'` and `'0000ff'` (top-left shares borders with top-right and bottom-left); `adjacency.get('ff0000')` does not contain `'ffff00'` (diagonal, not adjacent); `borderEdges` produces identical output as v0.0.1; `grep -rn 'import.*three' src/SectorRegistry.ts` returns empty.

---

### Task 3.2 — `MapEngine.getNeighbors`

**PRD Reference:** §3.2 (`getNeighbors` specification, guard order, one-liner body)

A small, focused task: one new public method on `MapEngine`. Separated from Task 3.1 to keep the registry change reviewable in isolation and to ensure the `readonly` constraint is confirmed before adding a method that depends on it. Depends on Task 3.1.

**Work:**

- Read `src/MapEngine.ts` before modifying. Confirm the existing two-check guard pattern (`_destroyed` first, `_loaded` second) used by `getSector`, `getSectorKeys`, `setSectorColor`, `resetSectorColor`.
- Implement `getNeighbors(hexKey: string): ReadonlySet<string> | undefined` following the same guard order:
  1. `if (this._destroyed) throw new Error('MapEngine: destroyed')`
  2. `if (!this._loaded) throw new Error('MapEngine: not loaded — call loadMap() first')`
  3. `return this._registry!.adjacency.get(hexKey)`
     The non-null assertion on `_registry` is safe because the `_loaded` guard guarantees it is assigned.

**Done when:** `npm run typecheck` passes; `engine.getNeighbors(hexKey)` return value is `===` to `engine.registry.adjacency.get(hexKey)` for any registered key; `engine.getNeighbors('unknown')` returns `undefined`; throws `'MapEngine: destroyed'` after `destroy()`; throws `'MapEngine: not loaded — call loadMap() first'` before `loadMap()` completes.

---

### Task 3.3 — Epic 3 Tests and Example App

**PRD Reference:** §"Acceptance Criteria — Epic 3" (ACs 3.1–3.11); §"Universal: Example App Coverage" (AC 3.10); §"Test Harness Strategy" (Epic 3 test harness — direct `SectorRegistry` construction, `buildTestBuffer`)

Writes the full test suite for Epic 3 and adds the neighbor-highlighting demo. **Epic 3 tests construct `SectorRegistry` directly** with hand-built pixel buffers — no `MapEngine.loadMap()` required for most ACs. Uses `buildTestBuffer` from `test/testUtils.ts`.

**Work:**

- Create a new test file following v0.0.1 naming convention. Most tests construct `SectorRegistry` directly:
  ```typescript
  const buf = buildTestBuffer(width, height, [[r,g,b], ...])
  const registry = new SectorRegistry(buf, width, height, definition)
  ```
  where `definition` is a `SectorDefinitionFile` literal. ACs that test `getNeighbors` guards require a `MapEngine` + `loadMap`.
- **AC 3.1** — Bidirectionality: for sectors A and B sharing at least one 4-connected pixel pair, `adjacency.get(A).has(B)` and `adjacency.get(B).has(A)`. toHexKey consistency (M-6): assert `registry.adjacency.get(toHexKey(r,g,b))` is defined (not `undefined`) for a sector whose key was derived from `toHexKey`.
- **AC 3.2** — Deduplication: two sectors sharing a long border appear exactly once in each other's set (use `Set.size === 1` assertion).
- **AC 3.3** — Pre-initialization: every key in the definition has an entry in `adjacency` (even if empty). An isolated sector returns an empty `ReadonlySet`, not `undefined`.
- **AC 3.4** — Bitmap-only color: present in pixel buffer but absent from definition → does not appear as a key in `adjacency` and does not appear as a value in any set.
- **AC 3.5** — 4-connectivity: 2×2 bitmap where A=(0,0), C=(1,0) and C=(0,1) (bitmap-only), B=(1,1); A and B are not adjacent (`adjacency.get(A)` is empty; `adjacency.get(B)` is empty).
- **AC 3.6** — `getNeighbors` proxy: (a) return value is `===` to `registry.adjacency.get(hexKey)` for a registered key; (b) returns `undefined` for a key not in the definition; (c) returns an empty `ReadonlySet` (not `undefined`) for a definition-registered sector that shares no pixel boundary with any other defined sector — assert `engine.getNeighbors(isolatedHexKey)` is defined and `Set.size === 0`; (d) returns `undefined` for a bitmap-only key (present in pixel buffer, absent from definition). **For sub-case (d):** Before writing the test, verify that `test/fixtures/test-4x4-mismatch.json` exists. If it is absent, create it as a `SectorDefinitionFile` JSON that defines `ff0000`, `00ff00`, and `0000ff` but omits `ffff00` — so `ffff00` appears in `test-4x4.png` as a bitmap-only color with no definition entry. Then use this fixture as the `definitionUrl` in `loadMap` and assert `engine.getNeighbors('ffff00')` returns `undefined`. The `SectorRegistry` direct-construction test for the same assertion can use a definition literal that excludes the color.
- **AC 3.7** — `borderEdges` retained: same values as v0.0.1; `BorderEdge` type and `borderEdges` field carry `@deprecated` JSDoc (verified by inspection of source).
- **AC 3.8** — No additional scan pass: code review criterion — confirm by reading `SectorRegistry.ts` that adjacency write logic is inside the same pixel-iteration block as `borderEdges`. No automated check needed.
- **AC 3.9** — P-1/P-2: `grep -rn 'import.*three' src/SectorRegistry.ts` → empty; `grep -rn 'document\|window\|HTMLCanvasElement\|OffscreenCanvas' src/SectorRegistry.ts` → empty; `grep -rn 'internal/color' src/SectorRegistry.ts` → empty.
- **AC 3.11** — Destroyed-guard: `engine.getNeighbors(hexKey)` throws `'MapEngine: destroyed'` after `engine.destroy()`.
- **AC 3.10 (example app)** — Before modifying `example/src/main.ts`, read the file in full. In the `sectorClick` handler (or equivalent): call `engine.getNeighbors(clickedHexKey)`, log neighbor hex keys to `<div id="neighbor-output">`, call `setSectorColor` on each neighbor, and on the next click reset previous neighbors via `resetSectorColor` before highlighting the new set. Existing v0.0.1 functionality must be preserved — new elements are additive.

**Done when:** `npm run test` passes (all ACs); `npm run typecheck` and `npm run typecheck:example` pass; `npm run format` applied; clicking a sector at `localhost:3000` populates `#neighbor-output` and highlights adjacent sectors on the map.
