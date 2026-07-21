---
paths:
  - 'example/**/*.ts'
  - 'example/**/*.css'
  - 'example/**/*.html'
---

## Role

The example app (`example/`, package `map-engine-example`) is a permanent fixture, not a throwaway demo. It has two jobs: showcase every public API surface, and serve as the teach-by-example integration reference. Keep it in sync with every public API change — a change that lands in `src/` without a matching example update leaves the reference stale.

The example runs directly against library source: `example/vite.config.ts` aliases `map-engine` → `../src/index.ts`, so HMR works with no library pre-build. Import from `'map-engine'`, never from a relative `../src` path — the alias resolves it.

For the library's own module layout, data flow, and folder placement, see structure.md.

## Commands

```bash
npm run example           # dev server at localhost:3000 (HMR against src)
npm run typecheck:example # tsc --noEmit for the example workspace
npm run build:example     # vite build of the example workspace
```

## Module layout

The app is a composition-root + feature-module architecture; keep the boundary intact when adding features.

| File                    | Role                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`           | Entry point — grabs the canvas, constructs `App`, `await app.start()`. Carries the API-surface header comment and the commented advanced `SectorBitmapParser`/`SectorRegistry` direct-usage block.                        |
| `src/app.ts`            | `App` — the composition root. Owns the `MapEngine` lifecycle (`start`/`reload`) and the `FEATURES` registry (mount order matters — see below).                                                                            |
| `src/lib/feature.ts`    | The `Feature` / `FeatureFactory` / `AppContext` contract every feature module implements.                                                                                                                                 |
| `src/lib/highlights.ts` | `HighlightLayers` — the declarative overlay-precedence manager (see below).                                                                                                                                               |
| `src/lib/colors.ts`     | Overlay color constants, shared across features.                                                                                                                                                                          |
| `src/lib/dom.ts`        | Shared DOM builders (`makeInfoRow`, `makeSkeletonRow`, etc.) and `setStatus`; the CSS-injection guard `assertSafeHexKey()` lives here.                                                                                    |
| `src/features/*.ts`     | One module per sidebar `<section>`, each a `createX(ctx: AppContext): Feature` factory returning `{ mount, destroy }`. A feature queries its own DOM, owns its own state, and subscribes to its own engine events/frames. |

Each feature is self-contained: it queries only the DOM elements inside its own sidebar section, calls the engine directly through `ctx.engine`, and tears everything down in `destroy()` (listeners via one `AbortController`, engine subscriptions via explicit `off`/`offFrame`). Shared, reusable DOM construction still lives in `lib/dom.ts` — reuse an existing builder rather than duplicating one into a feature. `app.ts` makes exactly one DOM call (the reload button) and otherwise only wires the feature registry — do not add feature-specific `getElementById` calls to `app.ts`.

Each sidebar `<section>` in `index.html` maps to one feature module (sector list, hover, selection/neighbors, frame hook, game clock, pathfinding, regions, borders, anchors, map modes). Add a feature as a new section plus its `features/*.ts` module, then register the factory in `app.ts`'s `FEATURES` array.

## Keeping in sync with the public API

When the public API changes, update the example so it demonstrates the current surface. The real surface lives across `features/*` (one file per demo) and `lib/highlights.ts` (`setSectorColor`/`resetSectorColor`, routed exclusively through `HighlightLayers`); `main.ts`'s header comment indexes every demonstrated symbol and its owning feature. Add the API call in the owning feature (or a new feature module), its DOM output alongside it, and a panel in `index.html` when the feature needs UI — then update the `main.ts` header index.

## Overlay color precedence

Multiple highlight layers can target the same sector; precedence is `selected > path > neighbor > region > hover`, restoring a sector to whichever layer still owns it rather than resetting to the map-mode default. This lives entirely in `lib/highlights.ts`'s `HighlightLayers` class — features never call `setSectorColor`/`resetSectorColor` directly, and never inspect another feature's layer. To add a new overlay layer: insert its name into `LAYER_ORDER` at the correct precedence position, then have the owning feature call `highlights.set(hex, layer, color)` / `highlights.clear(hex, layer)` on that layer only — `reconcile()`, the one place precedence is resolved, needs no changes.

## DOM safety

Validate any hex key with `assertSafeHexKey()` before interpolating it into a `style` string (`'#' + key`). Registry hex keys are consumer-supplied; the guard blocks CSS injection.

## Static assets

`public/map.png` (5680×4635 8-bit colormap) and `public/sectors.json` (36 sectors, `{ hexKey: { name: "County, Province" } }`) are committed fixtures. Do not generate or replace them programmatically. `loadMap` references them by relative URL (`'map.png'`, not `'/map.png'`) so they resolve under a subpath deployment; `vite.config.ts` sets `base: './'` for the same reason.

`sectors.json` entries carry only `name` — no `population`/`capital`/`climate` or other per-sector fields exist. Any hardcoded field list that mirrors this shape (the skeleton-row arrays in `hover.ts`/`selection.ts`, built from `lib/dom.ts`'s `makeSkeletonRow`) must list exactly the fields `buildSectorDataRows` renders for real data — check new field lists against this fixture, not against a prior implementation's skeleton, which can carry legacy fields forward silently (typecheck and tests don't catch a stale display label).

## Comment provenance

Inline comments reference a retired sprint system ("Epic 5 Task 5.3", "CA-7", "R10"). That system is archived and frozen (see docs/archive). Treat those tags as historical provenance, not actionable references.
