import type { PickResult, SectorData } from 'map-engine'

export interface SelectedRegistryData {
  bbox: [number, number, number, number] | undefined
  centroid: [number, number] | undefined
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
const pathOutputEl = document.getElementById('pathfinding-output')!
const regionsButtonsEl = document.getElementById('regions-buttons')!
const regionsOutputEl = document.getElementById('regions-output')!
const mapContainerEl = document.getElementById('map-container')!
const anchorsOutputEl = document.getElementById('anchors-output')!
const btnAnchorsToggle = document.getElementById(
  'btn-anchors-toggle'
) as HTMLButtonElement

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
        `${reg.bbox[0]},${reg.bbox[1]} → ${reg.bbox[2]},${reg.bbox[3]}`
      )
    )
  }
  if (reg.centroid) {
    advRows.push(
      makeInfoRow(
        'centroid',
        `(${reg.centroid[0].toFixed(1)}, ${reg.centroid[1].toFixed(1)})`
      )
    )
  }
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

export function setPathOutput(msg: string): void {
  pathOutputEl.textContent = msg
}

export function clearPathOutput(): void {
  pathOutputEl.textContent = 'Right-click two sectors to find a path'
}

// ─── Regions (Epic 6 Task 6.3 — Aggregation demo) ──────────────────────────

let regionButtons: HTMLButtonElement[] = []

/** Builds one button per region (province); buttons are generated at
 * runtime since they depend on the loaded map's sector names. */
export function renderRegionButtons(
  names: string[],
  onSelect: (index: number) => void
): void {
  regionButtons = names.map((name, index) => {
    const btn = document.createElement('button')
    btn.textContent = name
    btn.addEventListener('click', () => onSelect(index))
    return btn
  })
  regionsButtonsEl.replaceChildren(...regionButtons)
}

export function clearRegionButtons(): void {
  regionButtons = []
  regionsButtonsEl.replaceChildren()
}

/** Toggles the `.active` visual state; pass `null` to clear all. */
export function setActiveRegionButton(index: number | null): void {
  regionButtons.forEach((btn, i) => {
    btn.classList.toggle('active', i === index)
  })
}

export function setRegionOutput(
  name: string,
  bbox: [number, number, number, number],
  width: number,
  height: number
): void {
  regionsOutputEl.classList.remove('empty-state')
  regionsOutputEl.replaceChildren(
    makeInfoRow('region', name),
    makeInfoRow('bbox', `${bbox[0]},${bbox[1]} → ${bbox[2]},${bbox[3]}`),
    makeInfoRow('size', `${width} × ${height} px`)
  )
}

export function clearRegionOutput(): void {
  regionsOutputEl.classList.add('empty-state')
  regionsOutputEl.textContent = 'Select a region to see its bounding box'
}

// ─── Anchors (Epic 7 Task 7.2 — Spatial anchoring demo) ────────────────────
//
// One `.anchor-marker` (red) + one `.centroid-marker` (blue) DOM overlay per
// sector, appended into `#map-container` (the `#status` element above is the
// existing precedent for an absolute-positioned overlay). Positions are set
// by the controller every frame via `MapEngine.project()`, so these helpers
// only own creation/removal/visibility, not layout.

let anchorMarkerEls: HTMLElement[] = []
let centroidMarkerEls: HTMLElement[] = []

/** Creates one anchor + one centroid marker per sector; returns them index-aligned to numeric sector id. */
export function renderAnchorMarkers(sectorCount: number): {
  anchorEls: HTMLElement[]
  centroidEls: HTMLElement[]
} {
  clearAnchorMarkers()
  for (let i = 0; i < sectorCount; i++) {
    const anchorEl = document.createElement('div')
    anchorEl.className = 'anchor-marker'
    mapContainerEl.appendChild(anchorEl)
    anchorMarkerEls.push(anchorEl)

    const centroidEl = document.createElement('div')
    centroidEl.className = 'centroid-marker'
    mapContainerEl.appendChild(centroidEl)
    centroidMarkerEls.push(centroidEl)
  }
  return { anchorEls: anchorMarkerEls, centroidEls: centroidMarkerEls }
}

/** Removes all marker DOM elements (reload / toggle-off-and-forget teardown). */
export function clearAnchorMarkers(): void {
  for (const el of anchorMarkerEls) el.remove()
  for (const el of centroidMarkerEls) el.remove()
  anchorMarkerEls = []
  centroidMarkerEls = []
}

export function setAnchorMarkersVisible(visible: boolean): void {
  const display = visible ? '' : 'none'
  for (const el of anchorMarkerEls) el.style.display = display
  for (const el of centroidMarkerEls) el.style.display = display
}

export function setAnchorsToggleButton(active: boolean): void {
  btnAnchorsToggle.textContent = active ? 'Hide anchors' : 'Show anchors'
}

export function setAnchorsOutput(msg: string): void {
  anchorsOutputEl.classList.remove('empty-state')
  anchorsOutputEl.textContent = msg
}

export function clearAnchorsOutput(): void {
  anchorsOutputEl.classList.add('empty-state')
  anchorsOutputEl.textContent = 'Toggle anchors to see computed label points'
}
