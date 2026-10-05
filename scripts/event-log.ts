// The format of log/events.log and log/artifacts/, shared by commit.ts and
// check-log.ts so that the writer and the checker hold one definition.
import { createHash } from 'node:crypto'

export const LOG_DIR = 'log'
export const LOG_FILE = 'log/events.log'
export const ARTIFACT_DIR = 'log/artifacts'

const LINE = /^([0-9a-f]{64}) (0|[1-9][0-9]*) (.+)$/s
const ESCAPE = /\\(.?)/gs
const CONTROL = /\p{Cc}/u
const ARTIFACT_NAME = /^([0-9a-f]{64})((?:\.[a-z0-9]+)*)$/
const EXTENSION = /^(?:\.[a-z0-9]+)+$/
const ESCAPES: Record<string, string> = {
  '\\': '\\\\',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
}

export const sha256 = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex')

// A body escapes only four characters. Any other control character has no
// escape, so the writer refuses it in place of a line that the checker fails.
export const escapeBody = (text: string) => {
  const body = text.replace(/[\\\n\r\t]/g, char => ESCAPES[char])
  if (CONTROL.test(body)) {
    throw new Error('the body holds a control character with no escape')
  }
  return body
}

export const formatLine = (body: string, timeS: number) =>
  `${sha256(body)} ${timeS} ${body}\n`

export const artifactName = (bytes: Uint8Array, baseName: string) => {
  const dot = baseName.indexOf('.', 1)
  const extension = dot === -1 ? '' : baseName.slice(dot).toLowerCase()
  if (extension !== '' && !EXTENSION.test(extension)) {
    throw new Error(`the extension ${extension} is not dot-separated a-z0-9`)
  }
  return `${sha256(bytes)}${extension}`
}

// The hash part of a valid artifact name, or null.
export const artifactHash = (name: string) =>
  ARTIFACT_NAME.exec(name)?.[1] ?? null

export type LineFault = { rule: string; text: string }

// The faults of one line, with no newline. An empty list means a valid line.
export const checkLine = (line: string) => {
  const faults: LineFault[] = []
  const match = LINE.exec(line)
  if (!match) {
    faults.push({
      rule: 'line-form',
      text: 'the line is not "<sha256 hex> <unix seconds> <body>"',
    })
    return faults
  }

  const [, id, , body] = match
  if (id !== sha256(body)) {
    faults.push({ rule: 'id-hash', text: `id ${id} is not sha256 of the body` })
  }
  if (CONTROL.test(body)) {
    faults.push({
      rule: 'body-control',
      text: 'the body holds a raw control character',
    })
  }
  for (const [, next] of body.matchAll(ESCAPE)) {
    if ('\\nrt'.includes(next) && next !== '') continue
    faults.push({
      rule: 'body-escape',
      text: `the body holds the escape \\${next}, not \\\\, \\n, \\r, or \\t`,
    })
    break
  }
  return faults
}

export const lineId = (line: string) => line.slice(0, 64)

// Split the bytes of a log file into lines, or name the fault of the file.
export const splitLog = (bytes: Uint8Array) => {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      bytes
    )
  } catch {
    return { lines: [], fault: 'the file is not valid UTF-8' }
  }
  if (text === '') return { lines: [], fault: null }
  if (!text.endsWith('\n')) {
    return { lines: [], fault: 'the file does not end with a newline' }
  }
  return { lines: text.slice(0, -1).split('\n'), fault: null }
}
