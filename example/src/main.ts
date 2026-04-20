/**
 * map-engine canonical example
 *
 * Demonstrates every public API surface:
 *   MapEngine, MapRenderer, SectorRegistry, SectorBitmapParser, toHexKey
 *   Events: sectorHover, sectorClick
 *   Methods: loadMap, setSectorColor, resetSectorColor, getSector, getSectorKeys,
 *            on, off, destroy, engine.registry.*, engine.renderer.*
 */

import MapEngine, {
  GameClock,
  toHexKey,
  type PickResult,
  type SectorData,
} from 'map-engine'

// ─── ID conventions ──────────────────────────────────────────────────────────
// v0.0.2 adds: frame-counter, tick-counter, clock-speed
// v0.0.2+ reserved (Task 3.3 — add here, no renaming needed):
//   neighbor-output

// ─── DOM refs ────────────────────────────────────────────────────────────────

const canvas = document.getElementById('map') as HTMLCanvasElement
const statusEl = document.getElementById('status')!
const hoverContent = document.getElementById('hover-content')!
const selectedContent = document.getElementById('selected-content')!
const advancedContent = document.getElementById('advanced-content')!
const chkHover = document.getElementById('chk-hover') as HTMLInputElement
const btnReload = document.getElementById('btn-reload')!
const sectorList = document.getElementById('sector-list')!
const sectorCount = document.getElementById('sector-count')!
const frameCounterEl = document.getElementById('frame-counter')!
const tickCounterEl = document.getElementById('tick-counter')!
const clockSpeedEl = document.getElementById('clock-speed')!
const btnClockPause = document.getElementById('btn-clock-pause')!
const btnClockSpeedHalf = document.getElementById('btn-clock-speed-half')!
const btnClockSpeed1 = document.getElementById('btn-clock-speed-1')!
const btnClockSpeed2 = document.getElementById('btn-clock-speed-2')!
const btnClockSpeed5 = document.getElementById('btn-clock-speed-5')!

// ─── State ───────────────────────────────────────────────────────────────────

let engine: MapEngine | null = null
let lastHovered: string | null = null
let selectedHex: string | null = null
let gameClock: GameClock | null = null

// Frame hook state
let frameCount = 0
let pulseHexKey: string | null = null
let pulsePhase = 0

// ─── Hover handler (declared separately so we can off() it) ──────────────────

function onHover(result: PickResult | null): void {
  if (result) {
    // Restore previous hover if moving to a different sector
    if (
      lastHovered &&
      lastHovered !== result.hexKey &&
      lastHovered !== selectedHex
    ) {
      engine!.resetSectorColor(lastHovered)
    }
    // Apply transient highlight only if not the selected sector
    if (result.hexKey !== selectedHex) {
      engine!.setSectorColor(result.hexKey, '#e8e8d0')
    }
    lastHovered = result.hexKey
    renderHoverPanel(result)
  } else {
    if (lastHovered && lastHovered !== selectedHex) {
      engine!.resetSectorColor(lastHovered)
    }
    lastHovered = null
    clearHoverPanel()
  }
}

// ─── Click handler ───────────────────────────────────────────────────────────

function onClick(result: PickResult): void {
  if (selectedHex === result.hexKey) {
    // Deselect
    const wasSelected = selectedHex
    pulseHexKey = null
    pulsePhase = 0
    engine!.resetSectorColor(wasSelected)
    selectedHex = null
    clearSelectedPanel()
    // Re-apply hover highlight if still hovering the same sector
    if (lastHovered === wasSelected) {
      engine!.setSectorColor(wasSelected, '#e8e8d0')
    }
  } else {
    // Move selection: release previous, start pulsing new
    if (selectedHex) engine!.resetSectorColor(selectedHex)
    pulseHexKey = result.hexKey
    pulsePhase = 0
    selectedHex = result.hexKey
    renderSelectedPanel(result)
  }
}

// ─── Frame hook ───────────────────────────────────────────────────────────────

function onFrameTick(dt: number): void {
  frameCount++
  frameCounterEl.textContent = `Frames: ${frameCount}`

  if (pulseHexKey && engine) {
    pulsePhase = (pulsePhase + dt * 1.5) % 1
    const hue = Math.round(pulsePhase * 360)
    engine.setSectorColor(pulseHexKey, `hsl(${hue}, 90%, 55%)`)
  }
}

// ─── Engine lifecycle ─────────────────────────────────────────────────────────

async function startEngine(): Promise<void> {
  engine = new MapEngine()

  engine.on('sectorHover', onHover)
  engine.on('sectorClick', onClick)

  setStatus('Loading map…')

  await engine.loadMap({
    bitmapUrl: '/map.png',
    definitionUrl: '/sectors.json',
    canvas,
  })

  // Register frame hook after loadMap — demonstrates onFrame API
  engine.onFrame(onFrameTick)

  // Create GameClock — demonstrates standalone clock API
  gameClock = new GameClock(engine, { ticksPerSecond: 1 })
  gameClock.onTick(elapsed => {
    tickCounterEl.textContent = `Ticks: ${elapsed}`
    clockSpeedEl.textContent = `Speed: ${gameClock!.speed}×`
  })

  setStatus('Ready — scroll to zoom, drag to pan')
  renderSectorList()
}

function stopEngine(): void {
  if (!engine) return
  engine.off('sectorHover', onHover)
  engine.off('sectorClick', onClick)
  gameClock?.destroy()
  gameClock = null
  engine.destroy() // also clears all onFrame callbacks
  engine = null
  lastHovered = null
  selectedHex = null
  frameCount = 0
  frameCounterEl.textContent = 'Frames: 0'
  tickCounterEl.textContent = 'Ticks: 0'
  clockSpeedEl.textContent = 'Speed: 1×'
  pulseHexKey = null
  pulsePhase = 0
}

// ─── UI rendering helpers ─────────────────────────────────────────────────────

function setStatus(msg: string): void {
  statusEl.textContent = msg
}

function infoRow(label: string, value: string): string {
  return `<div class="info-row">
    <span class="info-label">${label}</span>
    <span class="info-value">${value}</span>
  </div>`
}

function swatch(hex: string): string {
  return `<span class="hex-swatch" style="background:#${hex}"></span>`
}

function renderSectorData(data: SectorData, hexKey: string): string {
  let html = infoRow('hex', `${swatch(hexKey)}<code>#${hexKey}</code>`)
  html += infoRow('name', String(data.name ?? '—'))
  // Render any extra custom fields from sectors.json
  for (const [k, v] of Object.entries(data)) {
    if (k === 'name') continue
    html += infoRow(k, String(v))
  }
  return html
}

function renderHoverPanel(result: PickResult): void {
  hoverContent.innerHTML =
    renderSectorData(result.sectorData, result.hexKey) +
    infoRow('pixel', `(${result.pixelX}, ${result.pixelY})`)
}

// Skeleton rows mirror the populated panel layouts so size stays fixed.
// Hover: hex, name, + custom fields (population, capital, climate), pixel.
// Selected: same minus pixel. Advanced: bbox, centroid, pixels.
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

function skeletonRow(label: string): string {
  return `<div class="info-row">
    <span class="info-label">${label}</span>
    <span class="info-value"><span class="skeleton-bar"></span></span>
  </div>`
}

function clearHoverPanel(): void {
  hoverContent.innerHTML = HOVER_SKELETON_ROWS.map(skeletonRow).join('')
}

function renderSelectedPanel(result: PickResult): void {
  selectedContent.innerHTML = renderSectorData(result.sectorData, result.hexKey)
  selectedContent.classList.remove('empty-state')

  // Show advanced registry data (always visible — skeleton when nothing selected)
  if (engine) {
    const bbox = engine.registry.bboxes.get(result.hexKey)
    const centroid = engine.registry.centroids.get(result.hexKey)
    const pixelCount =
      engine.registry.pixelIndices.get(result.hexKey)?.length ?? 0

    let adv = ''
    if (bbox)
      adv += infoRow(
        'bbox',
        `${bbox.minX},${bbox.minY} → ${bbox.maxX},${bbox.maxY}`
      )
    if (centroid)
      adv += infoRow(
        'centroid',
        `(${centroid.x.toFixed(1)}, ${centroid.y.toFixed(1)})`
      )
    adv += infoRow('pixels', String(pixelCount))
    advancedContent.innerHTML = adv
  }
}

function clearSelectedPanel(): void {
  selectedContent.innerHTML = SELECTED_SKELETON_ROWS.map(skeletonRow).join('')
  selectedContent.classList.remove('empty-state')
  advancedContent.innerHTML = ADVANCED_SKELETON_ROWS.map(skeletonRow).join('')
}

function renderSectorList(): void {
  if (!engine) return
  const keys = engine.getSectorKeys()
  sectorCount.textContent = String(keys.length)
  sectorList.innerHTML = ''

  for (const key of keys) {
    const data = engine.getSector(key)
    const li = document.createElement('li')
    li.className = 'sector-item'
    li.innerHTML = `
      <span class="swatch" style="background:#${key}"></span>
      <span class="sector-name">${data?.name ?? '(unnamed)'}</span>
      <span class="sector-key">#${key}</span>
    `
    sectorList.appendChild(li)
  }

  // Demonstrate toHexKey: verify round-trip for first sector
  if (keys.length > 0) {
    const first = keys[0]
    const r = parseInt(first.slice(0, 2), 16)
    const g = parseInt(first.slice(2, 4), 16)
    const b = parseInt(first.slice(4, 6), 16)
    const roundTripped = toHexKey(r, g, b)
    console.assert(
      roundTripped === first,
      `toHexKey round-trip failed: ${first} → ${roundTripped}`
    )
    console.info(
      `[map-engine] toHexKey(${r}, ${g}, ${b}) === "${roundTripped}" ✓`
    )
  }
}

// ─── Control wiring ───────────────────────────────────────────────────────────

// Hover toggle: demonstrates engine.off() / engine.on()
chkHover.addEventListener('change', () => {
  if (!engine) return
  if (chkHover.checked) {
    engine.on('sectorHover', onHover)
  } else {
    // Restore any highlighted hover before disabling
    if (lastHovered && lastHovered !== selectedHex) {
      engine.resetSectorColor(lastHovered)
      lastHovered = null
      clearHoverPanel()
    }
    engine.off('sectorHover', onHover)
  }
})

// Clock controls
btnClockPause.addEventListener('click', () => {
  if (!gameClock) return
  if (gameClock.paused) {
    gameClock.resume()
    btnClockPause.textContent = 'Pause'
  } else {
    gameClock.pause()
    btnClockPause.textContent = 'Resume'
  }
  clockSpeedEl.textContent = `Speed: ${gameClock.speed}×`
})

btnClockSpeedHalf.addEventListener('click', () => {
  if (!gameClock) return
  gameClock.setSpeed(0.5)
  btnClockPause.textContent = 'Pause'
  clockSpeedEl.textContent = `Speed: ${gameClock.speed}×`
})

btnClockSpeed1.addEventListener('click', () => {
  if (!gameClock) return
  gameClock.setSpeed(1)
  btnClockPause.textContent = 'Pause'
  clockSpeedEl.textContent = `Speed: ${gameClock.speed}×`
})

btnClockSpeed2.addEventListener('click', () => {
  if (!gameClock) return
  gameClock.setSpeed(2)
  btnClockPause.textContent = 'Pause'
  clockSpeedEl.textContent = `Speed: ${gameClock.speed}×`
})

btnClockSpeed5.addEventListener('click', () => {
  if (!gameClock) return
  gameClock.setSpeed(5)
  btnClockPause.textContent = 'Pause'
  clockSpeedEl.textContent = `Speed: ${gameClock.speed}×`
})

// Reload: demonstrates destroy() + fresh loadMap()
btnReload.addEventListener('click', async () => {
  stopEngine()
  clearHoverPanel()
  clearSelectedPanel()
  sectorList.innerHTML = ''
  sectorCount.textContent = '0'
  setStatus('Reloading…')
  await startEngine()
})

// ─── Boot ─────────────────────────────────────────────────────────────────────

/*
 * Direct SectorBitmapParser + SectorRegistry usage (advanced / Worker pattern):
 *
 *   import { SectorBitmapParser, SectorRegistry } from 'map-engine'
 *
 *   const parser = new SectorBitmapParser()
 *   const { buffer, width, height } = await parser.parse('/map.png')
 *
 *   const response = await fetch('/sectors.json')
 *   const definition = await response.json()
 *
 *   const registry = new SectorRegistry(buffer, width, height, definition)
 *   // registry.bboxes, registry.centroids, registry.pixelIndices are now available
 *   // Both SectorBitmapParser and SectorRegistry are DOM-free and Worker-safe.
 */

clearHoverPanel()
clearSelectedPanel()
await startEngine()
