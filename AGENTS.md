# AGENTS.md

This file holds every rule for an agent in this repository.

## Ground rules

- Make no git write: no stage, commit, branch, tag, or push. The maintainer
  makes each one.
- Before you end a task, run the four typechecks, `npm test`, and
  `npm run build`, and make sure that each one exits 0.
- Run `npm run format` on each file that you changed.
- Change no line of `log/events.log` and no file of `log/artifacts/`, because
  the log is append-only and `npm run check:log` fails an edit of the history.
- State what was measured in each claim about a measurement. A typecheck, a
  test, or a build proves that code is well formed, not that a claim is true.

## The repository

`map-engine` is a TypeScript ESM library, not an app. It draws a
grand-strategy map in the browser with Three.js, from a PNG in which each RGB
color is one sector and a JSON file that defines the sectors. `README.md` is
the public page, and `docs/REFERENCE.md` is the full reference.

- `src/`: the library, with the entry `src/index.ts`. Put each module in one
  subsystem directory: `core`, `sector`, `shared`, `render`, `worker`, or
  `input`.
- `example/`: the example app, an npm workspace. Its Vite config aliases
  `map-engine` to `../src/index.ts`, so the app runs on the source.
- `test/`: Vitest in browser mode with Playwright. `test/event-log.node.ts`
  runs under `node --test`, because it builds git repositories.
- `bench/`: the benchmarks and the quickstart check, under Playwright.
- `bin/`: the checks of the built `dist/`, and the bench baseline capture.
- `scripts/`: the event log tools. `event-log.ts` holds the log format.
- `log/`: the event log, the durable history of the project.

## Checks

- `npm run typecheck`: `src/`.
- `npm run typecheck:example`: `example/`.
- `npm run typecheck:bench`: `bench/`.
- `npm run typecheck:test`: `test/` and `scripts/`.
- `npm test`: Vitest, the checks of `dist/`, and the event log tests.
- `npm run build`: `dist/`, then the checks in `bin/`.
- Put each TypeScript directory in one of the four typecheck configs, because
  no command checks a directory that no config includes.

## Other commands

- `npm ci`: the install, which also builds `dist/` by the prepare script.
- `npm run build:example`: the example app.
- `npm run size`: the gzipped bytes of the entry and the worker together.
- `npm run check:log`: the event log rules over the history.
- `npm run bench:verify` and `npm run verify:quickstart`: the bench checks.
- `npm run format`: Prettier over the repository.

## The event log

- The section `Development Event Log` of `README.md` describes the format, and
  `scripts/event-log.ts` implements it. `npm run check:log` names the commit
  and the rule of each violation.
- When the maintainer orders a commit, make it with the command below. It adds
  exactly one log line, files each artifact under its hash, and refuses a
  non-empty index.

  ```bash
  npm run commit -- --subject "<line>" --body <file> \
    [--artifact <file>]... [-- <path>...]
  ```

- Add the line of a merge commit to `log/events.log` by hand before
  `git commit`, because a merge fills the index that `npm run commit` refuses.

## Code rules

- Use ESM only, and export by name. `src/index.ts` keeps the one default
  export, `export { MapEngine as default }`.
- Write no enum and no parameter property, and import a type with
  `import type`. The root `tsconfig.json` sets `erasableSyntaxOnly` and
  `verbatimModuleSyntax`.
- Name a file for its primary export: PascalCase for one class or one type,
  such as `SectorRegistry.ts`, and kebab-case for a set of functions or values,
  such as `border-handlers.ts`.
- Name a unit test `<module>.test.ts`, an integration test `<module>.spec.ts`,
  and a WebGL test `<module>.gl.spec.ts`.
- Mark instance state with `private` and an `_` prefix, such as
  `private _isLoaded`, instead of a `#` field, because tests read internals as
  `obj['_foo']`.
- Start each boolean name with `is`, `has`, `are`, `can`, or `should`.
- Keep the public names `MapRenderer.leftHasDragged` and `RenderClock.inTick`
  as they are, because a rename breaks the public API.
- Use `interface` for an object shape, and `type` for a union, a function
  signature, or an alias.
- Put package imports first, a blank line, then relative imports. In each
  group, put value imports before `import type`, in alphabetical order of the
  path.
- Order the members of a class: fields, the constructor, public methods, then
  private methods.
- Give each method in `src/`, and each exported constant or public field, a
  JSDoc summary.
- Treat JSON hex keys as exact strings: `"FF0000"` and `"ff0000"` are two keys.

## Architecture rules

- Import nothing from Three.js in `SectorRegistry`.
- Use no DOM in `SectorBitmapParser` and `SectorRegistry`, so that the two can
  run in the Worker. Run `MapRenderer` and `MapEngine` on the main thread only.
- Send data to the Worker by `postMessage` with transferable `ArrayBuffer`s
  instead of `SharedArrayBuffer`, so that a static host with no COOP or COEP
  headers can serve the engine.
- Keep `three` external in the build, because a bundled Three.js multiplies
  the size of the package.
- Update the example under `example/src/features/` in the same change as each
  change of the public API.
