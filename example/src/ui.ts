import type { PickResult, SectorData } from 'map-engine'

export interface SelectedRegistryData {
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | undefined
  centroid: { x: number; y: number } | undefined
  pixelCount: number
}

// ─── DOM refs ────────────────────────────────────────────────────────────────

const statusEl = document.getElementById('status')!
const hoverContent = document.getElementById('hover-content')!
const selectedContent = document.getElementById('selected-content')!
const advancedContent = document.getElementById('advanced-content')!
const sectorList = document.getElementById('sector-list')!
const sectorCount = document.getElementById('sector-count')!
const frameCounterEl = document.getElementById('frame-counter')!
const tickCounterEl = document.getElementById('tick-counter')!
const clockSpeedEl = document.getElementById('clock-speed')!
const btnClockPause = document.getElementById('btn-clock-pause')!
const neighborOutputEl = document.getElementById('neighbor-output')!

// ─── Skeleton label sets ──────────────────────────────────────────────────────

const HOVER_SKELETON_ROWS = [
  'hex',
  'name',
  'population',
  'capital',
  'climate',
  'pixel',
]
const SELECTED_SKELETON_ROWS = [
  'hex',
  'name',
  'population',
  'capital',
  'climate',
]
const ADVANCED_SKELETON_ROWS = ['bbox', 'centroid', 'pixels']

// ─── Private DOM helpers ──────────────────────────────────────────────────────

function assertSafeHexKey(key: string): string {
  if (!/^[0-9a-f]{6}$/.test(key))
    throw new Error(`ui: invalid hex key: ${JSON.stringify(key)}`)
  return key
}

function makeInfoRow(label: string, value: string): HTMLElement {
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

function makeSwatchSpan(hexKey: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'hex-swatch'
  span.style.background = '#' + assertSafeHexKey(hexKey)
  return span
}

function makeHexRow(hexKey: string): HTMLElement {
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

function makeSkeletonRow(label: string): HTMLElement {
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

function buildSectorDataRows(data: SectorData, hexKey: string): HTMLElement[] {
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

// ─── Exported UI functions ────────────────────────────────────────────────────

export function setStatus(msg: string): void {
  statusEl.textContent = msg
}

export function renderHoverPanel(result: PickResult): void {
  hoverContent.replaceChildren(
    ...buildSectorDataRows(result.sectorData, result.hexKey),
    makeInfoRow('pixel', `(${result.pixelX}, ${result.pixelY})`)
  )
}

export function clearHoverPanel(): void {
  hoverContent.replaceChildren(...HOVER_SKELETON_ROWS.map(makeSkeletonRow))
}

export function renderSelectedPanel(
  result: PickResult,
  reg: SelectedRegistryData
): void {
  selectedContent.classList.remove('empty-state')
  selectedContent.replaceChildren(
    ...buildSectorDataRows(result.sectorData, result.hexKey)
  )

  const advRows: HTMLElement[] = []
  if (reg.bbox) {
    advRows.push(
      makeInfoRow(
        'bbox',
        `${reg.bbox.minX},${reg.bbox.minY} → ${reg.bbox.maxX},${reg.bbox.maxY}`
      )
    )
  }
  if (reg.centroid) {
    advRows.push(
      makeInfoRow(
        'centroid',
        `(${reg.centroid.x.toFixed(1)}, ${reg.centroid.y.toFixed(1)})`
      )
    )
  }
  advRows.push(makeInfoRow('pixels', String(reg.pixelCount)))
  advancedContent.replaceChildren(...advRows)
}

export function clearSelectedPanel(): void {
  selectedContent.replaceChildren(
    ...SELECTED_SKELETON_ROWS.map(makeSkeletonRow)
  )
  advancedContent.replaceChildren(
    ...ADVANCED_SKELETON_ROWS.map(makeSkeletonRow)
  )
}

export function renderSectorList(
  keys: string[],
  getSector: (key: string) => SectorData | undefined
): void {
  sectorCount.textContent = String(keys.length)
  const items: HTMLElement[] = keys.map(key => {
    const data = getSector(key)
    const li = document.createElement('li')
    li.className = 'sector-item'
    const sw = document.createElement('span')
    sw.className = 'swatch'
    sw.style.background = '#' + assertSafeHexKey(key)
    const name = document.createElement('span')
    name.className = 'sector-name'
    name.textContent = data?.name ?? '(unnamed)'
    const keySpan = document.createElement('span')
    keySpan.className = 'sector-key'
    keySpan.textContent = '#' + key
    li.appendChild(sw)
    li.appendChild(name)
    li.appendChild(keySpan)
    return li
  })
  sectorList.replaceChildren(...items)
}

export function clearSectorList(): void {
  sectorCount.textContent = '0'
  sectorList.replaceChildren()
}

export function setFrameCounter(n: number): void {
  frameCounterEl.textContent = `Frames: ${n}`
}

export function setTickCounter(n: number): void {
  tickCounterEl.textContent = `Ticks: ${n}`
}

export function setClockSpeed(n: number): void {
  clockSpeedEl.textContent = `Speed: ${n}×`
}

export function setNeighborOutput(keys: string[]): void {
  neighborOutputEl.textContent = keys.length > 0 ? keys.join(', ') : '(none)'
}

export function clearNeighborOutput(): void {
  neighborOutputEl.textContent = '—'
}

export function setClockPauseButton(paused: boolean): void {
  btnClockPause.textContent = paused ? 'Resume' : 'Pause'
}
