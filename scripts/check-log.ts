// Check log/events.log and log/artifacts/ over the history and at HEAD.
// The rules start at the first commit that holds log/events.log, and every
// commit before it is skipped. Usage: node scripts/check-log.ts [repo-dir]
// Exit 0: every rule holds. Exit 1: a violation, and stderr names the commit
// and the rule of each. Exit 2: a fault.
import { spawnSync } from 'node:child_process'
import { existsSync, realpathSync, statSync } from 'node:fs'

import {
  ARTIFACT_DIR,
  LOG_FILE,
  artifactHash,
  checkLine,
  lineId,
  sha256,
  splitLog,
} from './event-log.ts'

const fault = (text: string): never => {
  console.error(`check-log: fault: ${text}`)
  process.exit(2)
}

const main = () => {
  if (process.argv.length > 3) fault('usage: node scripts/check-log.ts [dir]')
  const dir = process.argv[2] ?? '.'
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    fault(`${dir} is not a directory`)
  }

  const git = (args: string[]) => {
    const result = spawnSync('git', ['-C', dir, ...args], {
      maxBuffer: 1 << 30,
    })
    if (result.error) fault(`cannot run git: ${result.error.message}`)
    return {
      status: result.status,
      out: result.stdout,
      err: result.stderr.toString().trim(),
    }
  }
  const gitText = (args: string[]) => {
    const result = git(args)
    if (result.status !== 0) fault(`git ${args[0]}: ${result.err}`)
    return result.out.toString()
  }

  const top = git(['rev-parse', '--show-toplevel'])
  if (top.status !== 0) fault(`${dir} is not a git repository: ${top.err}`)
  if (realpathSync(top.out.toString().trim()) !== realpathSync(dir)) {
    fault(`${dir} is not the root of a git repository`)
  }
  if (git(['rev-parse', '--verify', '-q', 'HEAD^{commit}']).status !== 0) {
    fault(`${dir} has no commit`)
  }

  const commits = gitText([
    'rev-list',
    '--reverse',
    '--topo-order',
    '--parents',
    'HEAD',
  ])
    .trim()
    .split('\n')
    .map(row => row.split(' '))

  // The lines of log/events.log at a commit, null when the commit has no
  // such file, or the fault of the file.
  const logCache = new Map<
    string,
    { lines: string[]; fault: string | null } | null
  >()
  const logAt = (rev: string) => {
    if (logCache.has(rev)) return logCache.get(rev)!
    const type = git(['cat-file', '-t', `${rev}:${LOG_FILE}`])
    let log = null
    if (type.out.toString().trim() === 'blob') {
      log = splitLog(
        new Uint8Array(git(['cat-file', 'blob', `${rev}:${LOG_FILE}`]).out)
      )
    }
    logCache.set(rev, log)
    return log
  }

  // The artifact entries at a commit: path to blob id, and each tree.
  const artifactsAt = (rev: string) => {
    const blobs = new Map<string, string>()
    const trees: string[] = []
    const rows = gitText([
      'ls-tree',
      '-r',
      '-t',
      '-z',
      rev,
      '--',
      `${ARTIFACT_DIR}/`,
    ])
    for (const row of rows.split('\0')) {
      if (row === '') continue
      const [meta, path] = row.split('\t')
      const [, type, oid] = meta.split(' ')
      if (!path.startsWith(`${ARTIFACT_DIR}/`)) continue
      if (type === 'tree') trees.push(path)
      else blobs.set(path, oid)
    }
    return { blobs, trees }
  }

  const hashCache = new Map<string, string>()
  const hashOf = (oid: string) => {
    if (!hashCache.has(oid)) {
      hashCache.set(
        oid,
        sha256(new Uint8Array(git(['cat-file', 'blob', oid]).out))
      )
    }
    return hashCache.get(oid)!
  }

  const violations: string[] = []
  let checked = 0
  let skipped = 0

  for (const [commit, ...parents] of commits) {
    const fail = (rule: string, text: string) =>
      violations.push(`${commit} ${rule}: ${text}`)
    const log = logAt(commit)
    const parentLogs = parents.map(logAt)
    if (log === null && parentLogs.every(parentLog => parentLog === null)) {
      skipped++
      continue
    }
    checked++

    if (log === null) {
      fail('log-missing', `${LOG_FILE} is not a file in the commit`)
      continue
    }
    if (log.fault) {
      fail('file-form', `${LOG_FILE}: ${log.fault}`)
      continue
    }
    const seen = new Set<string>()
    for (const line of log.lines) {
      if (seen.has(line.slice(0, 64))) {
        fail('id-unique', `the id ${lineId(line)} is on two lines`)
        break
      }
      seen.add(lineId(line))
    }

    let added: string[] = []
    if (parents.length <= 1) {
      const before = parentLogs[0]?.lines ?? []
      const prefix = before.every((line, index) => log.lines[index] === line)
      if (!prefix || parentLogs[0]?.fault) {
        fail('prefix', `the parent ${LOG_FILE} is not a byte prefix of it`)
        continue
      }
      added = log.lines.slice(before.length)
      if (added.length !== 1) {
        fail('one-line', `the commit adds ${added.length} lines, not one`)
        continue
      }
    } else {
      const lines = new Set(log.lines)
      const inParents = new Set(
        parentLogs.flatMap(parentLog => parentLog?.lines ?? [])
      )
      const lost = [...inParents].filter(line => !lines.has(line))
      if (lost.length > 0) {
        fail('merge-keeps', `${lost.length} lines of a parent are missing`)
      }
      added = log.lines.filter(line => !inParents.has(line))
      if (added.length !== 1) {
        fail('merge-one-line', `the merge adds ${added.length} lines, not one`)
        continue
      }
    }
    for (const { rule, text } of checkLine(added[0])) fail(rule, text)

    const { blobs, trees } = artifactsAt(commit)
    for (const tree of trees) fail('artifact-flat', `${tree} is a directory`)
    const parentBlobs = parents.map(parent => artifactsAt(parent).blobs)
    for (const [path, oid] of blobs) {
      const name = path.slice(ARTIFACT_DIR.length + 1)
      if (name.includes('/')) continue
      const hash = artifactHash(name)
      if (name.startsWith('.')) fail('artifact-dotfile', `${path} is a dotfile`)
      else if (hash === null)
        fail('artifact-name', `${path} is not <sha256>[.ext]`)
      else if (hashOf(oid) !== hash)
        fail('artifact-hash', `${path} is not named by its sha256`)
      const isNew = parentBlobs.every(before => !before.has(path))
      if (isNew && hash !== null && !added[0].includes(hash)) {
        fail(
          'artifact-orphan',
          `${path} is added, and the added line does not name ${hash}`
        )
      }
    }
    for (const before of parentBlobs) {
      for (const [path, oid] of before) {
        if (blobs.get(path) === oid) continue
        fail('artifact-add-only', `${path} of a parent is changed or removed`)
      }
    }
  }

  // At HEAD, each artifact is named in some line.
  const head = logAt('HEAD')
  if (head !== null && !head.fault) {
    const text = head.lines.join('\n')
    for (const path of artifactsAt('HEAD').blobs.keys()) {
      const hash = artifactHash(path.slice(ARTIFACT_DIR.length + 1))
      if (hash === null || text.includes(hash)) continue
      violations.push(`HEAD artifact-unnamed: no line names ${path}`)
    }
  }

  if (violations.length > 0) {
    console.error(violations.join('\n'))
    process.exit(1)
  }
  const lines = head?.lines.length ?? 0
  console.log(
    `ok: ${commits.length} commits, ${skipped} before ${LOG_FILE}, ${checked} checked, ${lines} lines at HEAD`
  )
}

main()
