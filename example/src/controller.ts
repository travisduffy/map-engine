import MapEngine, { GameClock, toHexKey, type PickResult } from 'map-engine'
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
} from './ui'

export class AppController {
  private engine: MapEngine | null = null
  private gameClock: GameClock | null = null
  private lastHovered: string | null = null
  private selectedHex: string | null = null
  private frameCount = 0
  private pulseHexKey: string | null = null
  private pulsePhase = 0
  private previousNeighbors = new Set<string>()

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
    this.engine.on('sectorHover', this.onHover)
    this.engine.on('sectorClick', this.onClick)
    setStatus('Loading map…')

    try {
      await this.engine.loadMap({
        bitmapUrl: '/map.png',
        definitionUrl: '/sectors.json',
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

    setStatus('Ready — scroll to zoom, drag to pan')
    const keys = this.engine.getSectorKeys()
    renderSectorList(keys, key => this.engine!.getSector(key))

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
    setFrameCounter(0)
    setTickCounter(0)
    setClockSpeed(1)
    clearNeighborOutput()
  }

  private onHover = (result: PickResult | null): void => {
    if (result) {
      if (
        this.lastHovered &&
        this.lastHovered !== result.hexKey &&
        this.lastHovered !== this.selectedHex
      ) {
        if (this.previousNeighbors.has(this.lastHovered)) {
          this.engine!.setSectorColor(this.lastHovered, '#aaccff')
        } else {
          this.engine!.resetSectorColor(this.lastHovered)
        }
      }
      if (
        result.hexKey !== this.selectedHex &&
        !this.previousNeighbors.has(result.hexKey)
      ) {
        this.engine!.setSectorColor(result.hexKey, '#e8e8d0')
      }
      this.lastHovered = result.hexKey
      renderHoverPanel(result)
    } else {
      if (this.lastHovered && this.lastHovered !== this.selectedHex) {
        if (this.previousNeighbors.has(this.lastHovered)) {
          this.engine!.setSectorColor(this.lastHovered, '#aaccff')
        } else {
          this.engine!.resetSectorColor(this.lastHovered)
        }
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
      this.engine!.resetSectorColor(wasSelected)
      this.resetNeighborHighlights()
      this.selectedHex = null
      clearSelectedPanel()
      if (this.lastHovered === wasSelected) {
        this.engine!.setSectorColor(wasSelected, '#e8e8d0')
      }
    } else {
      if (this.selectedHex) this.engine!.resetSectorColor(this.selectedHex)
      this.resetNeighborHighlights(result.hexKey)
      this.pulseHexKey = result.hexKey
      this.pulsePhase = 0
      this.selectedHex = result.hexKey
      const reg: SelectedRegistryData = {
        bbox: this.engine!.registry.bboxes.get(result.hexKey),
        centroid: this.engine!.registry.centroids.get(result.hexKey),
        pixelCount:
          this.engine!.registry.pixelIndices.get(result.hexKey)?.length ?? 0,
      }
      renderSelectedPanel(result, reg)
      this.applyNeighborHighlights(result.hexKey)
    }
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
      if (hex !== exceptHex) this.engine!.resetSectorColor(hex)
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

    this.chkHover.addEventListener('change', () => {
      if (!this.engine) return
      if (this.chkHover.checked) {
        this.engine.on('sectorHover', this.onHover)
      } else {
        if (this.lastHovered && this.lastHovered !== this.selectedHex) {
          this.engine.resetSectorColor(this.lastHovered)
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
  }
}
