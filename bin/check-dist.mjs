import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

// Only a URL that is built from `import.meta.url` is a worker URL.
const WORKER_URL =
  /new URL\(\s*(?:\/\*[^*]*\*\/\s*)?(?:"" \+ new URL\()?"([^"]+\.js)"\)?(?:\.href)?\s*,\s*import\.meta\.url/g
// The build keeps three external, so the entry imports it by its bare name.
const THREE_IMPORT = /\bfrom\s*["']three["']/
// A URL with a scheme or a root is not relative to the entry file.
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:|^\//i
// Each Worker CALL method that the source registers.
const HANDLER = /registerCallHandler\(\s*'([A-Za-z]+)'/g

const fail = message => {
  console.error('check-dist:', message)
  process.exit(1)
}

const root = resolve(process.argv[2] ?? `${import.meta.dirname}/..`)
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const entry = resolve(root, pkg.exports['.'].import)
const types = resolve(root, pkg.exports['.'].types)

for (const file of [entry, types]) {
  if (!existsSync(file)) fail(`missing file ${file}`)
}

const source = readFileSync(entry, 'utf8')
if (!THREE_IMPORT.test(source)) {
  fail(`the entry ${entry} does not import three bare`)
}

const urls = [...source.matchAll(WORKER_URL)].map(match => match[1])
if (urls.length === 0) {
  fail(`no worker URL found in ${entry}`)
}

for (const url of urls) {
  if (ABSOLUTE_URL.test(url)) {
    fail(`worker URL "${url}" is not relative to the entry`)
  }
  if (!existsSync(resolve(dirname(entry), url))) {
    fail(`worker URL "${url}" names no file next to ${entry}`)
  }
}

// A bundler can drop a module that is imported only for its side effects,
// such as the module that registers the pathfinding handlers. The worker then
// rejects each call to those methods, and every other check still passes.
const workerSource = resolve(root, 'src', 'worker')
if (!existsSync(workerSource)) {
  fail(`missing directory ${workerSource}`)
}
const handlers = readdirSync(workerSource)
  .filter(name => name.endsWith('.ts'))
  .flatMap(name => [
    ...readFileSync(join(workerSource, name), 'utf8').matchAll(HANDLER),
  ])
  .map(match => match[1])
if (handlers.length === 0) {
  fail(`no worker handler found in ${workerSource}`)
}
const workers = urls
  .map(url => readFileSync(resolve(dirname(entry), url), 'utf8'))
  .join('\n')
for (const handler of handlers) {
  if (!new RegExp(`["'\`]${handler}["'\`]`).test(workers)) {
    fail(`worker handler "${handler}" is not in the built worker`)
  }
}

console.log(
  `check-dist: ok, ${urls.length} worker URL(s) resolve next to the entry, ${handlers.length} worker handlers built`
)
