import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'

const SOURCE_PATH = 'src/core/MapRenderer.ts'
const DIST_PATH = 'dist/core/MapRenderer.d.ts'
const LIBRARY_DIR = `${sep}node_modules${sep}`

// A consumer that names the types of the package, and one callback that has
// no annotation: it is an implicit any when the types do not resolve.
const CONSUMER = `import {
  MapEngine,
  type MapConfig,
  type MapView,
  type PickResult,
} from 'map-engine'

const engine = new MapEngine()
const config: MapConfig | undefined = undefined
const view: MapView | null = engine.getView()
const picks: PickResult[] = []
engine.on('sectorClick', result => picks.push(result))
engine.getSectorKeys().forEach(key => key.length)
engine.getSectorId('ff0000')
engine.getSectorKey(0)
export { config, view }
`

// The class members that a file declares, in a form that the compiler emits
// or the source writes: property, method, or accessor, with any modifier. A
// member is marked when stripInternal removes it: it reads any leading comment
// that holds the marker, `//` and `/* */` too.
const listMembers = (ts, file, text) => {
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest)
  const names = []
  const visit = node => {
    if (ts.isClassDeclaration(node) && node.name?.text === 'MapRenderer') {
      for (const member of node.members) {
        if (member.name === undefined) {
          continue
        }
        const comments =
          ts.getLeadingCommentRanges(text, member.getFullStart()) ?? []
        const marked = comments.some(({ pos, end }) =>
          text.slice(pos, end).includes('@internal')
        )
        names.push({ name: member.name.getText(sourceFile), marked })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return names
}

// The module option that each resolution accepts.
const RESOLUTIONS = { nodenext: 'nodenext', bundler: 'esnext' }

// The compiler prints one diagnostic per block, with indented lines for its
// detail. A diagnostic in a file under a node_modules directory belongs to
// the types of another package, and not to map-engine, so it is dropped.
const keepDiagnostics = output => {
  const diagnostics = output.split(/\n(?=\S)/).filter(Boolean)
  const kept = diagnostics.filter(diagnostic => {
    const file = diagnostic.match(/^(.+?)\(\d+,\d+\): /)?.[1]
    return file === undefined || !resolve(file).includes(LIBRARY_DIR)
  })
  return { kept, dropped: diagnostics.length - kept.length }
}

const main = async () => {
  const root = resolve(process.argv[2] ?? resolve(import.meta.dirname, '..'))
  const tsc = resolve(root, 'node_modules/typescript/bin/tsc')
  const ts = createRequire(resolve(root, 'package.json'))('typescript')
  const work = mkdtempSync(join(tmpdir(), 'check-dist-types-'))

  const check = ([resolution, moduleOption]) => {
    const dir = join(work, resolution)
    const link = join(dir, 'node_modules/map-engine')
    mkdirSync(resolve(link, '..'), { recursive: true })
    // A junction needs no privilege on Windows, and a symlink does.
    symlinkSync(root, link, 'junction')
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}')
    writeFileSync(join(dir, 'consumer.ts'), CONSUMER)
    const compilerOptions = {
      noEmit: true,
      strict: true,
      skipLibCheck: false,
      pretty: false,
      types: [],
      target: 'ES2020',
      lib: ['ES2020', 'DOM'],
      module: moduleOption,
      moduleResolution: resolution,
    }
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions, files: ['consumer.ts'] })
    )
    const result = spawnSync(process.execPath, [tsc, '-p', dir], {
      encoding: 'utf8',
    })
    const { kept, dropped } = keepDiagnostics(result.stdout ?? '')
    const failed = kept.length > 0 || (result.status !== 0 && dropped === 0)
    return { resolution, failed, kept, dropped, error: result.error }
  }

  let results
  try {
    results = Object.entries(RESOLUTIONS).map(check)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }

  const sourceMembers = listMembers(
    ts,
    SOURCE_PATH,
    readFileSync(resolve(root, SOURCE_PATH), 'utf8')
  )
  const internalNames = sourceMembers
    .filter(({ marked }) => marked)
    .map(({ name }) => name)
  const declaredNames = listMembers(
    ts,
    DIST_PATH,
    readFileSync(resolve(root, DIST_PATH), 'utf8')
  ).map(({ name }) => name)
  const leaked = internalNames.filter(name => declaredNames.includes(name))

  const failed = results.filter(({ failed }) => failed)
  for (const { resolution, kept, error } of failed) {
    console.error(
      `check-dist-types: failed under ${resolution}:`,
      kept.join('\n') || error
    )
  }
  if (internalNames.length === 0) {
    console.error('check-dist-types: no internal member found in:', SOURCE_PATH)
  }
  if (declaredNames.length === 0) {
    console.error('check-dist-types: no member found in:', DIST_PATH)
  }
  if (leaked.length > 0) {
    console.error(
      'check-dist-types: declarations of MapRenderer name internal members:',
      leaked.join(', ')
    )
  }
  if (
    failed.length > 0 ||
    internalNames.length === 0 ||
    declaredNames.length === 0 ||
    leaked.length > 0
  ) {
    process.exit(1)
  }
  const dropped = results.reduce((sum, result) => sum + result.dropped, 0)
  console.log(
    `check-dist-types: ok under ${Object.keys(RESOLUTIONS).join(' and ')}, no internal member of MapRenderer, ${internalNames.length} internal members read, ${dropped} diagnostics of other packages dropped`
  )
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
