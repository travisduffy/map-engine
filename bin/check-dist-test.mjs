import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CHECK = resolve(import.meta.dirname, 'check-dist.mjs')
const TYPES_CHECK = resolve(import.meta.dirname, 'check-dist-types.mjs')
const PACKAGE_ROOT = resolve(import.meta.dirname, '..')

const THREE_IMPORT = 'import * as e from "three";\n'
// A worker source that registers one handler, and a built worker that holds it.
const HANDLER_SOURCE = "registerCallHandler('findPath', () => {})\n"
const WORKER_BODY = 'r("findPath",()=>{});\n'

const writePlainUrl = url => `new URL("${url}", import.meta.url)`
// The build wraps the plain form in a second URL.
const writeNestedUrl = url =>
  `new URL("" + ${writePlainUrl(url)}.href, import.meta.url)`

// A case with a reason also needs the check to say it, so a check that skips
// the nested form cannot pass.
const CASES = [
  ['a relative worker URL', 'assets/worker.js', 0],
  ['a root-absolute worker URL', '/assets/worker.js', 1],
  ['a worker URL with a scheme', 'https://example.com/worker.js', 1],
  ['a relative worker URL with no file', 'assets/missing.js', 1],
  ['an entry that does not import three', 'assets/worker.js', 1, ''],
  [
    'the nested worker URL that the build emits',
    'assets/worker.js',
    0,
    THREE_IMPORT,
    writeNestedUrl,
  ],
  [
    'a nested root-absolute worker URL',
    '/assets/worker.js',
    1,
    THREE_IMPORT,
    writeNestedUrl,
    'is not relative',
  ],
  [
    'a built worker that lacks a registered handler',
    'assets/worker.js',
    1,
    THREE_IMPORT,
    writePlainUrl,
    'is not in the built worker',
    '',
  ],
  [
    'a worker source with no handler',
    'assets/worker.js',
    1,
    THREE_IMPORT,
    writePlainUrl,
    'no worker handler found',
    WORKER_BODY,
    '',
  ],
]

const RENDERER_DECLARATION =
  'export declare class MapRenderer { shown: number }\n'
const RENDERER_SOURCE =
  'export class MapRenderer {\n  /** @internal */\n  hidden = 1\n}\n'

// A declaration case sets the type that getView returns in the dist of a
// small package, and the consumer check runs on that package. A case can also
// set the declaration and the source of MapRenderer, for the two guards of
// an empty list.
const TYPE_CASES = [
  [
    'a declaration that names an undeclared type',
    'Undeclared',
    1,
    'Undeclared',
  ],
  [
    'a declaration of MapRenderer with no member',
    'MapView',
    1,
    'no member found in:',
    'export declare class MapRenderer {}\n',
  ],
  [
    'a source of MapRenderer with no internal member',
    'MapView',
    1,
    'no internal member found in:',
    RENDERER_DECLARATION,
    'export class MapRenderer {\n  shown = 1\n}\n',
  ],
]

const writeIndexDeclaration = viewType => `export type MapConfig = {}
export type MapView = {}
export type PickResult = {}
export declare class MapEngine {
  on(event: string, listener: (result: PickResult) => void): void
  getView(): ${viewType} | null
  getSectorKeys(): string[]
  getSectorId(key: string): number
  getSectorKey(id: number): string
}
`

const root = mkdtempSync(join(tmpdir(), 'check-dist-'))

const run = (
  name,
  url,
  expected,
  head = THREE_IMPORT,
  form = writePlainUrl,
  reason = '',
  workerBody = WORKER_BODY,
  handlerSource = HANDLER_SOURCE
) => {
  const dir = join(root, name.replaceAll(' ', '-'))
  mkdirSync(join(dir, 'dist', 'assets'), { recursive: true })
  mkdirSync(join(dir, 'src', 'worker'), { recursive: true })
  writeFileSync(join(dir, 'src', 'worker', 'handlers.ts'), handlerSource)
  const exports = {
    '.': { import: './dist/index.js', types: './dist/index.d.ts' },
  }
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ exports }))
  writeFileSync(join(dir, 'dist', 'index.d.ts'), '')
  writeFileSync(join(dir, 'dist', 'assets', 'worker.js'), workerBody)
  writeFileSync(
    join(dir, 'dist', 'index.js'),
    `${head}new Worker(${form(url)}, { type: "module" })`
  )
  const { status, stderr } = spawnSync('node', [CHECK, dir], {
    encoding: 'utf8',
  })
  return status === expected && (stderr ?? '').includes(reason)
}

const runTypes = (
  name,
  viewType,
  expected,
  reason,
  declaration = RENDERER_DECLARATION,
  source = RENDERER_SOURCE
) => {
  const dir = join(root, name.replaceAll(' ', '-'))
  mkdirSync(join(dir, 'dist', 'core'), { recursive: true })
  mkdirSync(join(dir, 'src', 'core'), { recursive: true })
  symlinkSync(
    join(PACKAGE_ROOT, 'node_modules'),
    join(dir, 'node_modules'),
    'junction'
  )
  const exports = { '.': { types: './dist/index.d.ts' } }
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'map-engine', type: 'module', exports })
  )
  writeFileSync(
    join(dir, 'dist', 'index.d.ts'),
    writeIndexDeclaration(viewType)
  )
  writeFileSync(join(dir, 'dist', 'core', 'MapRenderer.d.ts'), declaration)
  writeFileSync(join(dir, 'src', 'core', 'MapRenderer.ts'), source)
  const { status, stderr } = spawnSync('node', [TYPES_CHECK, dir], {
    encoding: 'utf8',
  })
  return status === expected && (stderr ?? '').includes(reason)
}

let failed = []
try {
  failed = [
    ...CASES.filter(([name, ...args]) => !run(name, ...args)),
    ...TYPE_CASES.filter(([name, ...args]) => !runTypes(name, ...args)),
  ]
} finally {
  rmSync(root, { recursive: true, force: true })
}

for (const [name, , expected] of failed) {
  console.error('check-dist-test: expected exit', expected, 'for', name)
}
if (failed.length > 0) {
  process.exit(1)
}
console.log(`check-dist-test: ok, ${CASES.length + TYPE_CASES.length} cases`)
