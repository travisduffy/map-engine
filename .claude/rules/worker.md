---
paths:
  - 'src/worker/**/*.ts'
---

## Worker boundary and Transferable discipline

`MapEngine`/`MapRenderer` are Main-thread only (they own `HTMLCanvasElement`/WebGL). `SectorRegistry`/`SectorBitmapParser` stay zero-DOM and zero-Three.js so they remain constructible inside the Worker. Cross-thread data moves via `postMessage` with Transferable `ArrayBuffer`s, never `SharedArrayBuffer` — this keeps the engine deployable on zero-config static hosts with no COOP/COEP headers. After the one-time `BOOTSTRAP` transfer, a Main-resident `pixelIndicesMirror` (`Uint16Array` downcast of `pixelIndices`) is retained solely for `webglcontextrestored` index-texture recovery; reading it for anything else risks staleness against the Worker's live state.
