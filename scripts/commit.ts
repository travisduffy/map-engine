// Make one commit that appends one line to log/events.log.
// Exit 0: committed. Exit 1: refused, or a step failed and the log file and
// the index are restored. Exit 2: a usage error or a fault.
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { parseArgs } from 'node:util'

import {
  ARTIFACT_DIR,
  LOG_DIR,
  LOG_FILE,
  artifactName,
  escapeBody,
  formatLine,
  lineId,
  splitLog,
} from './event-log.ts'

const USAGE =
  'usage: npm run commit -- --subject "<one line>" --body <file> [--artifact <file>]... [-- <path>...]'

const die = (code: number, text: string): never => {
  console.error(`commit: ${text}`)
  process.exit(code)
}

const git = (args: string[], input?: string) => {
  const result = spawnSync('git', args, {
    input,
    maxBuffer: 1 << 30,
  })
  if (result.error) die(2, `cannot run git: ${result.error.message}`)
  return {
    status: result.status,
    out: result.stdout,
    err: result.stderr.toString().trim(),
  }
}

const readArgs = () => {
  try {
    return parseArgs({
      options: {
        subject: { type: 'string' },
        body: { type: 'string' },
        artifact: { type: 'string', multiple: true },
      },
      allowPositionals: true,
      strict: true,
    })
  } catch (error) {
    return die(2, `${(error as Error).message}\n${USAGE}`)
  }
}

const isFile = (path: string) => existsSync(path) && lstatSync(path).isFile()

const main = () => {
  const { values, positionals: paths } = readArgs()
  const subject = values.subject ?? ''
  if (subject.trim() === '' || /[\r\n]/.test(subject)) {
    die(2, `--subject must be one non-empty line\n${USAGE}`)
  }
  if (values.body === undefined) die(2, `--body is required\n${USAGE}`)
  const bodyFile = values.body as string
  const artifactFiles = values.artifact ?? []

  const top = git(['rev-parse', '--show-toplevel'])
  if (top.status !== 0) die(2, `not a git repository: ${top.err}`)
  const root = realpathSync(top.out.toString().trim())
  if (realpathSync(process.cwd()) !== root) die(2, `run in the root ${root}`)

  // Every refusal comes before the first write.
  if (git(['diff', '--cached', '--quiet']).status !== 0) {
    die(1, 'refused: the index is not empty, so unstage it first')
  }
  const dirty = git(['status', '--porcelain', '--', LOG_DIR])
  if (dirty.out.length > 0) {
    die(1, `refused: ${LOG_DIR}/ has changes that no commit holds`)
  }
  if (!isFile(bodyFile)) die(1, `refused: the body file ${bodyFile} is missing`)
  const text = readFileSync(bodyFile, 'utf8').replace(/\n+$/, '')
  if (text.trim() === '') die(1, 'refused: the body is empty')

  const artifacts: { file: string; name: string }[] = []
  for (const file of artifactFiles) {
    if (!isFile(file)) die(1, `refused: the artifact ${file} is missing`)
    const bytes = readFileSync(file)
    let name = ''
    try {
      name = artifactName(bytes, basename(file))
    } catch (error) {
      die(1, `refused: artifact ${file}: ${(error as Error).message}`)
    }
    const target = join(ARTIFACT_DIR, name)
    if (existsSync(target) && !readFileSync(target).equals(bytes)) {
      die(1, `refused: ${target} exists with other bytes`)
    }
    artifacts.push({ file, name })
  }

  let body = ''
  const named = artifacts.map(({ name }) => `\nArtifact: ${name}`).join('')
  try {
    body = escapeBody(named === '' ? text : `${text}\n${named}`)
  } catch (error) {
    die(1, `refused: ${(error as Error).message}`)
  }

  const prior = existsSync(LOG_FILE) ? readFileSync(LOG_FILE) : null
  const { lines, fault } = splitLog(prior ?? new Uint8Array())
  if (fault) die(1, `refused: ${LOG_FILE}: ${fault}`)
  const line = formatLine(body, Math.floor(Date.now() / 1000))
  if (lines.some(old => lineId(old) === lineId(line))) {
    die(1, `refused: ${LOG_FILE} already holds a line with this body`)
  }

  const created: string[] = []
  const rollback = (step: string, reason: string): never => {
    const notes: string[] = []
    try {
      if (prior === null) unlinkSync(LOG_FILE)
      else writeFileSync(LOG_FILE, prior)
      notes.push(`${LOG_FILE} restored`)
    } catch (error) {
      notes.push(`${LOG_FILE} NOT restored (${(error as Error).message})`)
    }
    for (const path of created) {
      try {
        unlinkSync(path)
      } catch (error) {
        notes.push(`${path} NOT removed (${(error as Error).message})`)
      }
    }
    // The index matched HEAD at the start, so HEAD is the state to restore.
    const head = git(['rev-parse', '--verify', '-q', 'HEAD'])
    const reset = git(
      head.status === 0 ? ['read-tree', 'HEAD'] : ['read-tree', '--empty']
    )
    notes.push(
      reset.status === 0
        ? 'index restored'
        : `index NOT restored (${reset.err})`
    )
    return die(1, `step ${step} failed: ${reason}. ${notes.join(', ')}.`)
  }

  try {
    mkdirSync(ARTIFACT_DIR, { recursive: true })
    for (const { file, name } of artifacts) {
      const target = join(ARTIFACT_DIR, name)
      if (existsSync(target)) continue
      copyFileSync(file, target)
      created.push(target)
    }
    writeFileSync(
      LOG_FILE,
      Buffer.concat([prior ?? Buffer.alloc(0), Buffer.from(line)])
    )
  } catch (error) {
    rollback('write', (error as Error).message)
  }

  if (paths.length > 0) {
    const added = git(['add', '-A', '--', ...paths])
    if (added.status !== 0) rollback('stage paths', added.err)
  }
  // The .gitignore of a repository can match *.log, so the log is forced in.
  const logged = git(['add', '-f', '--', LOG_FILE, ...created])
  if (logged.status !== 0) rollback('stage log', logged.err)
  const stat = git(['diff', '--cached', '--numstat', '--', LOG_FILE])
  if (stat.out.toString().trim() !== `1\t0\t${LOG_FILE}`) {
    rollback('verify', `the staged diff of ${LOG_FILE} is not one added line`)
  }
  const committed = git(['commit', '-q', '-F', '-'], `${subject}\n`)
  if (committed.status !== 0) rollback('commit', committed.err)

  console.log(`committed ${lineId(line)}`)
}

main()
