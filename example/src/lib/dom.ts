import type { SectorData } from 'map-engine'

const statusEl = document.getElementById('status')!

/** Writes the bottom-left map status overlay. */
export function setStatus(msg: string): void {
  statusEl.textContent = msg
}

export function assertSafeHexKey(key: string): string {
  if (!/^[0-9a-f]{6}$/.test(key))
    throw new Error(`ui: invalid hex key: ${JSON.stringify(key)}`)
  return key
}

export function makeInfoRow(label: string, value: string): HTMLElement {
  const row = document.createElement('div')
  row.className = 'info-row'
  const lbl = document.createElement('span')
  lbl.className = 'info-label'
  lbl.textContent = label
  const val = document.createElement('span')
  val.className = 'info-value'
  val.textContent = value
  row.appendChild(lbl)
  row.appendChild(val)
  return row
}

export function makeSwatchSpan(hexKey: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'hex-swatch'
  span.style.background = '#' + assertSafeHexKey(hexKey)
  return span
}

export function makeHexRow(hexKey: string): HTMLElement {
  const row = document.createElement('div')
  row.className = 'info-row'
  const lbl = document.createElement('span')
  lbl.className = 'info-label'
  lbl.textContent = 'hex'
  const val = document.createElement('span')
  val.className = 'info-value'
  val.appendChild(makeSwatchSpan(hexKey))
  const code = document.createElement('code')
  code.textContent = '#' + hexKey
  val.appendChild(code)
  row.appendChild(lbl)
  row.appendChild(val)
  return row
}

export function makeSkeletonRow(label: string): HTMLElement {
  const row = document.createElement('div')
  row.className = 'info-row'
  const lbl = document.createElement('span')
  lbl.className = 'info-label'
  lbl.textContent = label
  const val = document.createElement('span')
  val.className = 'info-value'
  const bar = document.createElement('span')
  bar.className = 'skeleton-bar'
  val.appendChild(bar)
  row.appendChild(lbl)
  row.appendChild(val)
  return row
}

export function buildSectorDataRows(
  data: SectorData,
  hexKey: string
): HTMLElement[] {
  const rows: HTMLElement[] = [
    makeHexRow(hexKey),
    makeInfoRow('name', data.name),
  ]
  for (const [k, v] of Object.entries(data)) {
    if (k === 'name') continue
    rows.push(makeInfoRow(String(k), String(v)))
  }
  return rows
}
