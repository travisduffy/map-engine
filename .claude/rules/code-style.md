---
paths:
  - 'src/**/*.ts'
  - 'test/**/*.ts'
  - 'example/**/*.ts'
---

## Rule ownership

In-file conventions (naming, booleans, private members, types, imports, member order, comments) live in this file. Folder/module-layout and placement conventions live in `architecture.md`. When adding a rule, pick its home by this split: if the rule is decidable while looking at one file, it belongs here; if it is decidable only by looking at the tree, it belongs in `architecture.md`. See .claude/rules/architecture.md for layout.

## File naming

Name a file for the kind of its primary export. A file whose primary export is a class or a named interface/type shape takes PascalCase matching that export — `SectorRegistry.ts`, `SpatialGraph.ts`, `SimulationClock.ts` — whether the export is public or internal. A file that provides a collection of functions or values takes kebab-case — `aggregation-handlers.ts`, `border-handlers.ts`, `transferable-pool.ts`. A single-word leaf module stays lowercase — `types.ts`, `errors.ts`, `utils.ts`, `state.ts`, `yield.ts`, `polylabel.ts`, `index.ts`.

The filename tells a reader what kind of module it is before they open it: a capital initial means "a class/type lives here."

## Test file naming

Name a test file's base for the module it covers, using the same casing rule as that module: a unit test of `SectorRegistry.ts` is `SectorRegistry.test.ts`; a unit test of `spatial-graph.ts` is `spatial-graph.test.ts`.

Choose the suffix by test kind: `.test.ts` for a unit test, `.spec.ts` for an integration test, `.gl.spec.ts` for a browser/WebGL test. The suffix carries the unit-vs-integration signal at a glance.

## Private members

Mark instance state private with the `private` keyword and an `_` prefix — `private _isLoaded = false`. The keyword enforces encapsulation at compile time; the underscore flags private at every use-site (`this._backend`) and keeps the field reachable from tests via bracket access (`engine['_registry']`).

Write no `#`-private fields. Tests introspect internals through `obj['_foo']`, which a `#` field blocks.

## Boolean naming

Prefix every cognitive boolean — field, parameter, local, accessor, or boolean-returning method — with a boolean verb (`is`, `has`, `are`, `can`, `should`): `private _isLoaded`, `_areCostsReady`, `_handlePointerEvent(event, isClick)`, `get isPanning()`, a local `isInside`, a predicate method `_isHeapLess(i, j)`. A prefixed boolean reads as a yes/no question at its use-site. A method that returns a non-boolean is named for its result instead — `_centroidDistance`, not `_getCentroidDistance`.

Two public members on exported classes keep non-conforming names as frozen exceptions — they are public surface, and renaming it is out of scope (R10): `MapRenderer.leftHasDragged` and the `RenderClock.inTick` getter. A private boolean backing such an accessor still takes the prefix (`RenderClock._isInTick` backs `inTick`); only the public name is frozen. Record any further public-boolean exemption here rather than "fixing" it.

## Types vs interfaces

Use `interface` for a named object shape — `MapConfig`, `PickEvent`, `BootstrapPayload`. Use `type` for a union, a function signature, or an alias — `WorkerMessage` (union), `FrameCallback` (function), `MapModeId = string` (alias). Interfaces express extendable records; type aliases express everything else.

## Import ordering

Order imports in blank-line-separated groups: external packages first, then internal-relative modules. Within a group, place value imports before `import type` imports, alphabetized by module path.

```ts
import * as THREE from 'three'

import { SectorRegistry } from '../sector/SectorRegistry'
import { registerCallHandler } from './call-handlers'
import type { WorkerMessage } from '../shared/types'
```

## Member ordering

Order class members: fields first, then the constructor, then public methods (with a getter grouped next to its backing field), then private methods last. A reader sees state and construction before behavior, and the public surface before the internal mechanics.

Exception: private helpers that exist only to serve one public method may immediately follow that method rather than sinking to the bottom — keep a helper next to the single caller it belongs to.

## Comments and JSDoc

Give every method a JSDoc summary block — public and private alike. Co-located documentation states the method's intended behavior so a reader or agent learns it without tracing the body; a private method carries the explanation its name cannot (an algorithm's invariant, an admissibility bound, a tie-break rule).

Give every public or exported non-method member — an exported `const`, a public field — a JSDoc summary too. Comment a private field with a single line comment where its intent is not obvious from its name.

## Exports

Export by name from every module; write no `export default` inside `src`. The package entry `src/index.ts` alone provides `export { MapEngine as default }` as a convenience alias — add no other default export, and do not churn this one. Named exports keep import sites explicit and every symbol greppable.
