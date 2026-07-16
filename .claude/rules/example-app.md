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

The app is a three-file split; keep the boundary intact when adding features.

| File                | Role                                                                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main.ts`       | Composition root — grabs the canvas + hover checkbox, constructs `AppController`, `await app.start()`. Carries the API-surface header comment and the commented advanced `SectorBitmapParser`/`SectorRegistry` direct-usage block. |
| `src/controller.ts` | `AppController` — owns the `MapEngine` instance, all engine state, event handlers, and every feature demo. Holds no `getElementById` calls; drives the UI through named `ui.ts` functions.                                         |
| `src/ui.ts`         | All DOM — every `getElementById`, element construction, and panel `render`/`set`/`clear` function. Imports only `PickResult`/`SectorData` types from the library, never the engine.                                                |

`controller.ts` owns logic, `ui.ts` owns DOM. Add engine wiring to the controller and DOM rendering to `ui.ts` — do not reach into `document` from the controller, and do not import `MapEngine` into `ui.ts`. This split is what keeps the app readable as a teaching reference.

Each sidebar `<section>` in `index.html` maps to one feature demo (hover, selection/neighbors, frame hook, game clock, pathfinding, regions, anchors, borders, map modes, lifecycle). Add a feature as a new section plus its controller/ui pair.

## Keeping in sync with the public API

When the public API changes, update the example so it demonstrates the current surface. The real surface lives in `controller.ts` (engine calls) and `ui.ts` (rendering); `main.ts` is only a composition root, and its header comment lists the demonstrated symbols. Add the API call in the controller, its output in `ui.ts`, and a panel in `index.html` when the feature needs UI.

## Overlay color precedence

Multiple highlight layers can target the same sector; precedence is `path > neighbor > region > none`. Route every "hand this sector back to its underlying state" through `AppController.restoreSectorBaseColor()`, which re-applies the highest-priority layer still owning the sector instead of resetting to the map-mode default. A new overlay layer slots into that precedence chain in `restoreSectorBaseColor`, `resetPathHighlights`, and `resetNeighborHighlights` — miss one and layers stomp each other on hover-out.

## DOM safety

Validate any hex key with `assertSafeHexKey()` before interpolating it into a `style` string (`'#' + key`). Registry hex keys are consumer-supplied; the guard blocks CSS injection.

## Static assets

`public/map.png` (5680×4635 8-bit colormap) and `public/sectors.json` (36 sectors, `{ hexKey: { name: "County, Province" } }`) are committed fixtures. Do not generate or replace them programmatically. `loadMap` references them by relative URL (`'map.png'`, not `'/map.png'`) so they resolve under a subpath deployment; `vite.config.ts` sets `base: './'` for the same reason.

## Comment provenance

Inline comments reference a retired sprint system ("Epic 5 Task 5.3", "CA-7", "R10"). That system is archived and frozen (see docs/archive). Treat those tags as historical provenance, not actionable references.
