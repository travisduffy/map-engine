import MapEngine, {
  GameClock,
  toHexKey,
  PathNotFoundError,
  type PickResult,
} from 'map-engine'
import type { SelectedRegistryData } from './ui'
import {
  setStatus,
  renderHoverPanel,
  clearHoverPanel,
  renderSelectedPanel,
  clearSelectedPanel,
  renderSectorList,
  clearSectorList,
  setFrameCounter,
  setTickCounter,
  setClockSpeed,
  setNeighborOutput,
  clearNeighborOutput,
  setClockPauseButton,
  setPathOutput,
  clearPathOutput,
} from './ui'

const PATH_START_COLOR = '#ffcc00'
const PATH_ROUTE_COLOR = '#ff6a00'

export class AppController {
  private engine: MapEngine | null = null
  private gameClock: GameClock | null = null
  private lastHovered: string | null = null
  private selectedHex: string | null = null
  private frameCount = 0
  private pulseHexKey: string | null = null
  private pulsePhase = 0
  private previousNeighbors = new Set<string>()

  // Pathfinding demo (Epic 5 Task 5.3): right-click sets start, then end;
  // sectorKeys[numericId] resolves a findPath() result back to hex keys
  // (array index === numeric id, since getSectorKeys() returns idToHex order).
  private sectorKeys: string[] = []
  private hexToId = new Map<string, number>()
  private pathStartHex: string | null = null
  private pathSectors = new Set<string>()
  private pathHighlightColor = PATH_ROUTE_COLOR

  private readonly canvas: HTMLCanvasElement
  private readonly chkHover: HTMLInputElement

  constructor(canvas: HTMLCanvasElement, chkHover: HTMLInputElement) {
    this.canvas = canvas
    this.chkHover = chkHover
    this.wireControls()
  }

  async start(): Promise<void> {
    clearHoverPanel()
    clearSelectedPanel()
    await this.startEngine()
  }

  private async startEngine(): Promise<void> {
    this.engine = new MapEngine()
    this.engine.setTickRate(60) // must be called before loadMap() resolves
    this.engine.on('sectorHover', this.onHover)
    this.engine.on('sectorClick', this.onClick)
    setStatus('Loading map… (this may take a moment)')

    try {
      await this.engine.loadMap({
        // Relative (not root-absolute) so these resolve correctly under a
        // subpath deployment too (e.g. GH Pages project sites) — Epic 4
        // Task 4.4.
        bitmapUrl: 'map.png',
        definitionUrl: 'sectors.json',
        canvas: this.canvas,
      })
    } catch (err) {
      setStatus(
        `Failed to load map: ${err instanceof Error ? err.message : String(err)}`
      )
      this.engine.destroy()
      this.engine = null
      return
    }

    this.engine.onFrame(this.onFrameTick)

    this.gameClock = new GameClock(this.engine, { ticksPerSecond: 1 })
    this.gameClock.onTick(elapsed => {
      setTickCounter(elapsed)
      setClockSpeed(this.gameClock!.speed)
    })

    setStatus('Ready — scroll to zoom, middle-mouse drag to pan')
    const keys = this.engine.getSectorKeys()
    renderSectorList(keys, key => this.engine!.getSector(key))

    this.registerMapModes(keys)

    // Pathfinding demo (Epic 5 Task 5.3): uniform cost 1 so findPath()
    // returns the fewest-hop route; hexToId/sectorKeys bridge the hex-key
    // pick results to/from findPath()'s numeric sector ids.
    this.sectorKeys = keys
    this.hexToId.clear()
    keys.forEach((key, id) => this.hexToId.set(key, id))
    await this.engine.setTraversalCosts(new Uint8Array(keys.length).fill(1))

    // Demonstrate toHexKey API: verify round-trip for first sector
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

  /** Registers the 'default' and 'grayscale' map modes (CA-7 Quickstart demo). */
  private registerMapModes(keys: string[]): void {
    if (!this.engine) return
    const defaultColors = new Uint32Array(keys.length)
    const grayscaleColors = new Uint32Array(keys.length)
    for (let i = 0; i < keys.length; i++) {
      const packed = parseInt(keys[i], 16)
      defaultColors[i] = packed
      const r = (packed >>> 16) & 0xff
      const g = (packed >>> 8) & 0xff
      const b = packed & 0xff
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
      grayscaleColors[i] = (gray << 16) | (gray << 8) | gray
    }
    this.engine.registerMapMode('default', defaultColors)
    this.engine.registerMapMode('grayscale', grayscaleColors)
    this.engine.setMapMode('default')
  }

  private stopEngine(): void {
    if (!this.engine) return
    // off() throws if engine is destroyed — must be called before destroy()
    this.engine.off('sectorHover', this.onHover)
    this.engine.off('sectorClick', this.onClick)
    this.gameClock?.destroy()
    this.gameClock = null
    this.engine.destroy()
    this.engine = null
    this.resetState()
  }

  private resetState(): void {
    this.lastHovered = null
    this.selectedHex = null
    this.frameCount = 0
    this.pulseHexKey = null
    this.pulsePhase = 0
    this.previousNeighbors.clear()
    this.sectorKeys = []
    this.hexToId.clear()
    this.pathStartHex = null
    this.pathSectors.clear()
    setFrameCounter(0)
    setTickCounter(0)
    setClockSpeed(1)
    clearNeighborOutput()
    clearPathOutput()
  }

  // Restores a sector to whichever highlight layer currently owns it
  // (path > neighbor > none), instead of unconditionally resetting to the
  // map-mode default. Used anywhere a transient overlay (hover, selection)
  // needs to hand a sector back to its underlying state.
  private restoreSectorBaseColor(hexKey: string): void {
    if (this.pathSectors.has(hexKey)) {
      this.engine!.setSectorColor(hexKey, this.pathHighlightColor)
    } else if (this.previousNeighbors.has(hexKey)) {
      this.engine!.setSectorColor(hexKey, '#aaccff')
    } else {
      this.engine!.resetSectorColor(hexKey)
    }
  }

  private onHover = (result: PickResult | null): void => {
    if (result) {
      if (
        this.lastHovered &&
        this.lastHovered !== result.hexKey &&
        this.lastHovered !== this.selectedHex
      ) {
        this.restoreSectorBaseColor(this.lastHovered)
      }
      if (
        result.hexKey !== this.selectedHex &&
        !this.previousNeighbors.has(result.hexKey) &&
        !this.pathSectors.has(result.hexKey)
      ) {
        this.engine!.setSectorColor(result.hexKey, '#e8e8d0')
      }
      this.lastHovered = result.hexKey
      renderHoverPanel(result)
    } else {
      if (this.lastHovered && this.lastHovered !== this.selectedHex) {
        this.restoreSectorBaseColor(this.lastHovered)
      }
      this.lastHovered = null
      clearHoverPanel()
    }
  }

  private onClick = (result: PickResult): void => {
    if (this.selectedHex === result.hexKey) {
      const wasSelected = this.selectedHex
      this.pulseHexKey = null
      this.pulsePhase = 0
      this.restoreSectorBaseColor(wasSelected)
      this.resetNeighborHighlights()
      this.selectedHex = null
      clearSelectedPanel()
      if (this.lastHovered === wasSelected) {
        this.engine!.setSectorColor(wasSelected, '#e8e8d0')
      }
    } else {
      if (this.selectedHex) this.restoreSectorBaseColor(this.selectedHex)
      this.resetNeighborHighlights(result.hexKey)
      this.pulseHexKey = result.hexKey
      this.pulsePhase = 0
      this.selectedHex = result.hexKey
      const reg: SelectedRegistryData = {
        bbox: this.engine!.getBBox(result.hexKey),
        centroid: this.engine!.getCentroid(result.hexKey),
      }
      renderSelectedPanel(result, reg)
      this.applyNeighborHighlights(result.hexKey)
    }
  }

  // Right-click sets the pathfinding start sector, then the end sector;
  // left-click's select/neighbor-highlight behavior above is untouched.
  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault()
    void this.handlePathPick(e.clientX, e.clientY)
  }

  private async handlePathPick(
    clientX: number,
    clientY: number
  ): Promise<void> {
    if (!this.engine) return
    const result = await this.engine.pick({ clientX, clientY })
    if (!result) return

    if (!this.pathStartHex) {
      this.resetPathHighlights()
      this.pathStartHex = result.hexKey
      this.pathHighlightColor = PATH_START_COLOR
      this.engine.setSectorColor(result.hexKey, PATH_START_COLOR)
      this.pathSectors.add(result.hexKey)
      setPathOutput(`Start: #${result.hexKey} — right-click an end sector`)
      return
    }

    const startHex = this.pathStartHex
    const endHex = result.hexKey
    this.pathStartHex = null

    if (startHex === endHex) {
      this.resetPathHighlights()
      clearPathOutput()
      return
    }

    const startId = this.hexToId.get(startHex)
    const endId = this.hexToId.get(endHex)
    if (startId === undefined || endId === undefined) return

    setPathOutput(`Finding path from #${startHex} to #${endHex}…`)
    try {
      const path = await this.engine.findPath(startId, endId)
      this.resetPathHighlights()
      this.pathHighlightColor = PATH_ROUTE_COLOR
      const hexPath = Array.from(path).map(id => this.sectorKeys[id])
      for (const hex of hexPath) {
        this.engine.setSectorColor(hex, PATH_ROUTE_COLOR)
        this.pathSectors.add(hex)
      }
      setPathOutput(
        `Path: ${hexPath.length} sectors — #${hexPath.join(' → #')}`
      )
    } catch (err) {
      this.resetPathHighlights()
      if (err instanceof PathNotFoundError) {
        setPathOutput(`No path exists between #${startHex} and #${endHex}`)
      } else {
        setPathOutput(
          `Pathfinding failed: ${err instanceof Error ? err.message : String(err)}`
        )
      }
    }
  }

  private resetPathHighlights(): void {
    for (const hex of this.pathSectors) {
      this.engine!.resetSectorColor(hex)
    }
    this.pathSectors.clear()
  }

  private onFrameTick = (dt: number): void => {
    this.frameCount++
    setFrameCounter(this.frameCount)

    if (this.pulseHexKey && this.engine) {
      this.pulsePhase = (this.pulsePhase + dt * 1.5) % 1
      const hue = Math.round(this.pulsePhase * 360)
      this.engine.setSectorColor(this.pulseHexKey, `hsl(${hue}, 90%, 55%)`)
    }
  }

  private applyNeighborHighlights(hexKey: string): void {
    const neighbors = this.engine!.getNeighbors(hexKey)
    if (!neighbors) return
    const keys: string[] = []
    for (const hex of neighbors) {
      if (hex !== this.selectedHex) {
        this.engine!.setSectorColor(hex, '#aaccff')
        this.previousNeighbors.add(hex)
        keys.push(hex)
      }
    }
    setNeighborOutput(keys)
  }

  private resetNeighborHighlights(exceptHex: string | null = null): void {
    for (const hex of this.previousNeighbors) {
      if (hex !== exceptHex) {
        if (this.pathSectors.has(hex)) {
          this.engine!.setSectorColor(hex, this.pathHighlightColor)
        } else {
          this.engine!.resetSectorColor(hex)
        }
      }
    }
    this.previousNeighbors.clear()
    clearNeighborOutput()
  }

  private wireControls(): void {
    const btnClockPause = document.getElementById('btn-clock-pause')!
    const btnClockSpeedHalf = document.getElementById('btn-clock-speed-half')!
    const btnClockSpeed1 = document.getElementById('btn-clock-speed-1')!
    const btnClockSpeed2 = document.getElementById('btn-clock-speed-2')!
    const btnClockSpeed5 = document.getElementById('btn-clock-speed-5')!
    const btnReload = document.getElementById('btn-reload')!
    const btnMapModeDefault = document.getElementById('btn-mapmode-default')!
    const btnMapModeGrayscale = document.getElementById(
      'btn-mapmode-grayscale'
    )!
    const btnPathClear = document.getElementById('btn-path-clear')!

    this.canvas.addEventListener('contextmenu', this.onContextMenu)

    btnPathClear.addEventListener('click', () => {
      this.pathStartHex = null
      this.resetPathHighlights()
      clearPathOutput()
    })

    this.chkHover.addEventListener('change', () => {
      if (!this.engine) return
      if (this.chkHover.checked) {
        this.engine.on('sectorHover', this.onHover)
      } else {
        if (this.lastHovered && this.lastHovered !== this.selectedHex) {
          this.restoreSectorBaseColor(this.lastHovered)
          this.lastHovered = null
          clearHoverPanel()
        }
        this.engine.off('sectorHover', this.onHover)
      }
    })

    btnClockPause.addEventListener('click', () => {
      if (!this.gameClock) return
      if (this.gameClock.paused) {
        this.gameClock.resume()
      } else {
        this.gameClock.pause()
      }
      setClockPauseButton(this.gameClock.paused)
      setClockSpeed(this.gameClock.speed)
    })

    btnClockSpeedHalf.addEventListener('click', () => {
      if (!this.gameClock) return
      this.gameClock.setSpeed(0.5)
      setClockPauseButton(false)
      setClockSpeed(this.gameClock.speed)
    })

    btnClockSpeed1.addEventListener('click', () => {
      if (!this.gameClock) return
      this.gameClock.setSpeed(1)
      setClockPauseButton(false)
      setClockSpeed(this.gameClock.speed)
    })

    btnClockSpeed2.addEventListener('click', () => {
      if (!this.gameClock) return
      this.gameClock.setSpeed(2)
      setClockPauseButton(false)
      setClockSpeed(this.gameClock.speed)
    })

    btnClockSpeed5.addEventListener('click', () => {
      if (!this.gameClock) return
      this.gameClock.setSpeed(5)
      setClockPauseButton(false)
      setClockSpeed(this.gameClock.speed)
    })

    btnReload.addEventListener('click', async () => {
      this.stopEngine()
      clearHoverPanel()
      clearSelectedPanel()
      clearSectorList()
      setStatus('Reloading…')
      await this.startEngine()
    })

    btnMapModeDefault.addEventListener('click', () => {
      this.engine?.setMapMode('default')
    })

    btnMapModeGrayscale.addEventListener('click', () => {
      this.engine?.setMapMode('grayscale')
    })
  }
}
