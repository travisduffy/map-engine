// The tests of scripts/commit.ts and scripts/check-log.ts. They run under
// node --test, not Vitest, because each case builds a git repository.
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'

import { formatLine, sha256 } from '../scripts/event-log.ts'

const SCRIPTS = resolve(import.meta.dirname, '..', 'scripts')
const LOG = 'log/events.log'
const ARTIFACTS = 'log/artifacts'
// A fixed author and no global config keep each case the same on every host.
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test',
}

const roots: string[] = []
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

const run = (cwd: string, command: string, args: string[]) => {
  const result = spawnSync(command, args, {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
  })
  return { status: result.status, out: result.stdout, err: result.stderr }
}

const git = (repo: string, ...args: string[]) => {
  const result = run(repo, 'git', args)
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.err}`)
  return result.out
}

const check = (repo: string) =>
  run(repo, process.execPath, [join(SCRIPTS, 'check-log.ts'), repo])

const commitScript = (repo: string, args: string[]) =>
  run(repo, process.execPath, [join(SCRIPTS, 'commit.ts'), ...args])

const write = (repo: string, path: string, bytes: string | Uint8Array) => {
  mkdirSync(dirname(join(repo, path)), { recursive: true })
  writeFileSync(join(repo, path), bytes)
}

// Commit each file as given, a null removes it, with no check of the log.
const commitRaw = (
  repo: string,
  files: Record<string, string | Uint8Array | null>
) => {
  for (const [path, bytes] of Object.entries(files)) {
    if (bytes === null) unlinkSync(join(repo, path))
    else write(repo, path, bytes)
    git(repo, 'add', '-A', '-f', '--', path)
  }
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'raw')
}

const readLog = (repo: string) => readFileSync(join(repo, LOG), 'utf8')

const commitEvent = (repo: string, text: string, ...extra: string[]) => {
  const bodyFile = join(repo, '..', `body-${sha256(text)}`)
  writeFileSync(bodyFile, text)
  const result = commitScript(repo, [
    '--subject',
    text.split('\n')[0],
    '--body',
    bodyFile,
    ...extra,
  ])
  assert.equal(result.status, 0, result.err)
}

const artifactBytes = 'the frozen artifact\n'
const artifactName = `${sha256(artifactBytes)}.txt`

// A repository with one commit before the log, then two events through
// scripts/commit.ts, the first with one artifact.
const makeRepo = () => {
  const root = mkdtempSync(join(tmpdir(), 'event-log-'))
  roots.push(root)
  const repo = join(root, 'repo')
  mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'main')
  write(repo, '.gitattributes', `${LOG} merge=union\n`)
  write(repo, '.gitignore', '*.log\n')
  write(repo, 'README.md', 'before the log\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'before the log')
  writeFileSync(join(root, 'note.txt'), artifactBytes)
  commitEvent(repo, 'first event', '--artifact', join(root, 'note.txt'))
  write(repo, 'README.md', 'with the log\n')
  commitEvent(repo, 'second event\nwith two lines', '--', 'README.md')
  return repo
}

const line = (body: string) => formatLine(body, 1791168000)

type Change = (repo: string) => void

const appendLines =
  (...lines: string[]): Change =>
  repo =>
    commitRaw(repo, { [LOG]: readLog(repo) + lines.join('') })

// A branch side with one event, merged into main with the given log file.
const mergeWith =
  (shape: (main: string, side: string) => string): Change =>
  repo => {
    git(repo, 'checkout', '-q', '-b', 'side', 'HEAD~1')
    commitEvent(repo, 'side event')
    const side = readLog(repo)
    git(repo, 'checkout', '-q', 'main')
    const main = readLog(repo)
    git(repo, 'merge', '-q', '--no-ff', '--no-commit', 'side')
    write(repo, LOG, shape(main, side))
    git(repo, 'add', '-f', '--', LOG)
    git(repo, 'commit', '-q', '--no-edit')
  }

const union = (main: string, side: string) =>
  main +
  side
    .split('\n')
    .filter(row => row && !main.includes(row))
    .map(row => `${row}\n`)
    .join('')

const withArtifact =
  (name: string, bytes: string, body = `adds ${name}`): Change =>
  repo =>
    commitRaw(repo, {
      [`${ARTIFACTS}/${name}`]: bytes,
      [LOG]: readLog(repo) + line(body),
    })

const otherBytes = 'another artifact\n'
const otherHash = sha256(otherBytes)

// Each rule has one change that keeps it and one change that breaks it.
const RULES: { rule: string; pass: Change; fail: Change }[] = [
  {
    rule: 'file-form',
    pass: appendLines(line('ends with a newline')),
    fail: appendLines(line('no newline').slice(0, -1)),
  },
  {
    rule: 'file-form',
    pass: appendLines(line('valid utf-8 é')),
    fail: repo =>
      commitRaw(repo, {
        [LOG]: Buffer.concat([
          Buffer.from(readLog(repo)),
          Buffer.from([0xff, 0x0a]),
        ]),
      }),
  },
  {
    rule: 'line-form',
    pass: appendLines(line('three fields')),
    fail: appendLines('not a log line\n'),
  },
  {
    rule: 'line-form',
    pass: appendLines(line('time is an integer')),
    fail: appendLines(`${sha256('x')} 17.5 x\n`),
  },
  {
    rule: 'id-hash',
    pass: appendLines(line('hashed body')),
    fail: appendLines(`${sha256('other body')} 1791168000 hashed body\n`),
  },
  {
    rule: 'body-escape',
    pass: appendLines(line('a\\\\b\\nc\\rd\\te')),
    fail: appendLines(line('a\\qb')),
  },
  {
    rule: 'body-escape',
    pass: appendLines(line('ends with an escape \\\\')),
    fail: appendLines(line('ends with a lone backslash \\')),
  },
  {
    rule: 'body-control',
    pass: appendLines(line('no control')),
    fail: appendLines(line('a raw \u0001 control')),
  },
  {
    rule: 'id-unique',
    pass: appendLines(line('a new body')),
    fail: repo => appendLines(readLog(repo).split('\n')[0] + '\n')(repo),
  },
  {
    rule: 'prefix',
    pass: appendLines(line('kept prefix')),
    fail: repo => {
      const [first, ...rest] = readLog(repo).split('\n')
      commitRaw(repo, {
        [LOG]:
          [...rest.filter(Boolean), first].join('\n') + '\n' + line('moved'),
      })
    },
  },
  {
    rule: 'one-line',
    pass: appendLines(line('one line')),
    fail: appendLines(line('line one'), line('line two')),
  },
  {
    rule: 'one-line',
    pass: appendLines(line('one line')),
    fail: repo => commitRaw(repo, { 'README.md': 'no event\n' }),
  },
  {
    rule: 'log-missing',
    pass: appendLines(line('kept file')),
    fail: repo => commitRaw(repo, { [LOG]: null }),
  },
  {
    rule: 'merge-keeps',
    pass: mergeWith((main, side) => union(main, side) + line('merge event')),
    fail: mergeWith(main => main + line('merge event')),
  },
  {
    rule: 'merge-one-line',
    pass: mergeWith((main, side) => union(main, side) + line('merge event')),
    fail: mergeWith((main, side) => union(main, side)),
  },
  {
    rule: 'artifact-flat',
    pass: withArtifact(`${otherHash}.txt`, otherBytes),
    fail: withArtifact(`sub/${otherHash}.txt`, otherBytes, `adds ${otherHash}`),
  },
  {
    rule: 'artifact-dotfile',
    pass: withArtifact(`${otherHash}.txt`, otherBytes),
    fail: withArtifact(`.${otherHash}`, otherBytes, `adds ${otherHash}`),
  },
  {
    rule: 'artifact-name',
    pass: withArtifact(`${otherHash}.tar.gz`, otherBytes),
    fail: withArtifact(`${otherHash}.Tar`, otherBytes),
  },
  {
    rule: 'artifact-hash',
    pass: withArtifact(otherHash, otherBytes),
    fail: withArtifact(otherHash, 'not the hashed bytes\n'),
  },
  {
    rule: 'artifact-orphan',
    pass: withArtifact(`${otherHash}.txt`, otherBytes),
    fail: withArtifact(`${otherHash}.txt`, otherBytes, 'names no artifact'),
  },
  {
    rule: 'artifact-add-only',
    pass: appendLines(line('artifact kept')),
    fail: repo =>
      commitRaw(repo, {
        [`${ARTIFACTS}/${artifactName}`]: 'changed\n',
        [LOG]: readLog(repo) + line('changes it'),
      }),
  },
  {
    rule: 'artifact-add-only',
    pass: appendLines(line('artifact kept')),
    fail: repo =>
      commitRaw(repo, {
        [`${ARTIFACTS}/${artifactName}`]: null,
        [LOG]: readLog(repo) + line('removes it'),
      }),
  },
  {
    rule: 'artifact-unnamed',
    pass: appendLines(line(`names ${artifactName}`)),
    fail: repo => {
      // The commits before the log are skipped, so only the check at HEAD
      // sees an artifact that a commit before the log added.
      const root = mkdtempSync(join(tmpdir(), 'event-log-'))
      roots.push(root)
      git(root, 'init', '-q', '-b', 'main')
      commitRaw(root, { [`${ARTIFACTS}/${otherHash}`]: otherBytes })
      commitRaw(root, { [LOG]: line('names nothing') })
      git(repo, 'fetch', '-q', root, 'main')
      git(repo, 'reset', '-q', '--hard', 'FETCH_HEAD')
    },
  },
]

for (const { rule, pass, fail } of RULES) {
  test(`${rule}: the check passes a history that keeps the rule`, () => {
    const repo = makeRepo()
    pass(repo)
    const result = check(repo)
    assert.equal(result.status, 0, result.err)
  })
  test(`${rule}: the check names the rule in a history that breaks it`, () => {
    const repo = makeRepo()
    fail(repo)
    const result = check(repo)
    assert.equal(result.status, 1, result.out + result.err)
    assert.match(
      result.err,
      new RegExp(`^[0-9a-f]{40} ${rule}: |^HEAD ${rule}: `, 'm')
    )
  })
}

test('commit: escapes the body and names each artifact in the line', () => {
  const repo = makeRepo()
  const lines = readLog(repo).split('\n')
  assert.equal(lines.length, 3)
  assert.match(
    lines[0],
    new RegExp(
      `^[0-9a-f]{64} \\d+ first event\\\\n\\\\nArtifact: ${artifactName}$`
    )
  )
  assert.match(lines[1], /^[0-9a-f]{64} \d+ second event\\nwith two lines$/)
  assert.equal(
    readFileSync(join(repo, ARTIFACTS, artifactName), 'utf8'),
    artifactBytes
  )
  assert.equal(git(repo, 'status', '--porcelain'), '')
  assert.equal(git(repo, 'log', '-1', '--format=%s'), 'second event\n')
})

test('commit: refuses a non-empty index and writes nothing', () => {
  const repo = makeRepo()
  const before = readLog(repo)
  write(repo, 'README.md', 'staged\n')
  git(repo, 'add', 'README.md')
  const bodyFile = join(repo, '..', 'refused-body')
  writeFileSync(bodyFile, 'refused event')
  const result = commitScript(repo, [
    '--subject',
    'refused',
    '--body',
    bodyFile,
  ])
  assert.equal(result.status, 1)
  assert.match(result.err, /the index is not empty/)
  assert.equal(readLog(repo), before)
})

test('commit: restores the log, the artifacts, and the index when the commit fails', () => {
  const repo = makeRepo()
  const before = readLog(repo)
  const hook = join(repo, '.git', 'hooks', 'pre-commit')
  writeFileSync(hook, '#!/bin/sh\nexit 1\n')
  chmodSync(hook, 0o755)
  write(repo, 'README.md', 'changed\n')
  const artifact = join(repo, '..', 'refused.bin')
  writeFileSync(artifact, otherBytes)
  const bodyFile = join(repo, '..', 'hooked-body')
  writeFileSync(bodyFile, 'hooked event')
  const result = commitScript(repo, [
    '--subject',
    'hooked',
    '--body',
    bodyFile,
    '--artifact',
    artifact,
    '--',
    'README.md',
  ])
  assert.equal(result.status, 1)
  assert.match(result.err, /step commit failed/)
  assert.equal(readLog(repo), before)
  assert.equal(existsSync(join(repo, ARTIFACTS, `${otherHash}.bin`)), false)
  assert.equal(git(repo, 'diff', '--cached', '--name-only'), '')
  assert.equal(readFileSync(join(repo, 'README.md'), 'utf8'), 'changed\n')
})

test('commit: refuses a body with a control character that has no escape', () => {
  const repo = makeRepo()
  const bodyFile = join(repo, '..', 'control-body')
  writeFileSync(bodyFile, 'bell \u0007 here')
  const result = commitScript(repo, ['--subject', 'bell', '--body', bodyFile])
  assert.equal(result.status, 1)
  assert.match(result.err, /control character/)
})

// Two branches that each append two events through scripts/commit.ts.
const makeBranches = () => {
  const repo = makeRepo()
  git(repo, 'checkout', '-q', '-b', 'left')
  commitEvent(repo, 'left one')
  commitEvent(repo, 'left two')
  git(repo, 'checkout', '-q', '-b', 'right', 'main')
  commitEvent(repo, 'right one')
  commitEvent(repo, 'right two')
  return repo
}

test('union: a merge commit with its own event passes the check', () => {
  const repo = makeBranches()
  git(repo, 'checkout', '-q', 'left')
  git(repo, 'merge', '-q', '--no-ff', '--no-commit', 'right')
  appendFileSync(join(repo, LOG), line('merge left and right'))
  git(repo, 'add', '-f', '--', LOG)
  git(repo, 'commit', '-q', '--no-edit')
  assert.equal(readLog(repo).split('\n').length, 8)
  const result = check(repo)
  assert.equal(result.status, 0, result.err)
})

test('union: a rebase of one branch onto the other passes the check', () => {
  const repo = makeBranches()
  git(repo, 'rebase', '-q', 'left')
  assert.equal(readLog(repo).split('\n').length, 7)
  const result = check(repo)
  assert.equal(result.status, 0, result.err)
})

test('check-log: an empty history before the log passes', () => {
  const root = mkdtempSync(join(tmpdir(), 'event-log-'))
  roots.push(root)
  git(root, 'init', '-q', '-b', 'main')
  commitRaw(root, { 'README.md': 'no log yet\n' })
  appendFileSync(join(root, 'README.md'), 'still none\n')
  const result = check(root)
  assert.equal(result.status, 0, result.err)
  assert.match(result.out, /1 before log\/events\.log, 0 checked/)
})
