import * as THREE from 'three'
import type { PickEvent } from '../types'

interface InputControllerOptions {
  onDirty: () => void
  pan: (delta: THREE.Vector2) => void
  zoom: (factor: number, ndcPoint: THREE.Vector2) => void
  pointerMove?: (e: PickEvent) => void
  click?: (e: PickEvent) => void
}

export class InputController {
  private static readonly _DRAG_DEAD_ZONE_PX = 4

  private _panPressed = false
  private _isPanning = false
  private _panOrigin = { x: 0, y: 0 }
  private _lastPointerPos = { x: 0, y: 0 }

  private _leftPressed = false
  private _leftDragActive = false
  private _leftHasDragged = false
  private _leftDragOrigin = { x: 0, y: 0 }

  private readonly _canvas: HTMLCanvasElement
  private readonly _onDirty: () => void
  private readonly _panCb: (delta: THREE.Vector2) => void
  private readonly _zoomCb: (factor: number, ndcPoint: THREE.Vector2) => void

  private readonly _boundPointerDown: (e: PointerEvent) => void
  private readonly _boundPointerMove: (e: PointerEvent) => void
  private readonly _boundPointerUp: (e: PointerEvent) => void
  private readonly _boundPointerCancel: () => void
  private readonly _boundWheel: (e: WheelEvent) => void
  private readonly _boundClick: ((e: PickEvent) => void) | null

  constructor(canvas: HTMLCanvasElement, options: InputControllerOptions) {
    this._canvas = canvas
    this._onDirty = options.onDirty
    this._panCb = options.pan
    this._zoomCb = options.zoom

    this._boundPointerDown = (e: PointerEvent) => {
      if (e.button === 1) {
        this._panPressed = true
        this._isPanning = false
        this._panOrigin = { x: e.clientX, y: e.clientY }
        this._lastPointerPos = { x: e.clientX, y: e.clientY }
        try {
          canvas.setPointerCapture(e.pointerId)
        } catch (_) {
          // Synthetic test events may not have a capturable pointer ID.
        }
      } else if (e.button === 0) {
        this._leftPressed = true
        this._leftDragActive = false
        this._leftHasDragged = false
        this._leftDragOrigin = { x: e.clientX, y: e.clientY }
      }
    }

    this._boundPointerMove = (e: PointerEvent) => {
      if (this._leftPressed && (e.buttons & 1) === 0) {
        this._leftPressed = false
        this._leftDragActive = false
      }

      if (this._panPressed) {
        const dx = e.clientX - this._lastPointerPos.x
        const dy = e.clientY - this._lastPointerPos.y
        this._lastPointerPos = { x: e.clientX, y: e.clientY }

        if (!this._isPanning) {
          const dist = Math.hypot(
            e.clientX - this._panOrigin.x,
            e.clientY - this._panOrigin.y
          )
          if (dist > InputController._DRAG_DEAD_ZONE_PX) this._isPanning = true
        }

        if (this._isPanning) {
          this.onPan(new THREE.Vector2(dx, dy))
        }
      }

      if (this._leftPressed && !this._leftDragActive) {
        const dist = Math.hypot(
          e.clientX - this._leftDragOrigin.x,
          e.clientY - this._leftDragOrigin.y
        )
        if (dist > InputController._DRAG_DEAD_ZONE_PX) {
          this._leftDragActive = true
          this._leftHasDragged = true
        }
      }

      if (options.pointerMove) options.pointerMove(e)
    }

    this._boundPointerUp = (e: PointerEvent) => {
      if (e.button === 1) {
        this._panPressed = false
        this._isPanning = false
      } else if (e.button === 0) {
        this._leftPressed = false
        this._leftDragActive = false
      }
    }

    this._boundPointerCancel = () => {
      this._panPressed = false
      this._isPanning = false
      this._leftPressed = false
      this._leftDragActive = false
    }

    this._boundWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = Math.pow(1.1, -e.deltaY / 100)
      const rect = canvas.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1)
      this.onZoom(factor, new THREE.Vector2(ndcX, ndcY))
    }

    this._boundClick = options.click ?? null

    canvas.addEventListener('pointerdown', this._boundPointerDown)
    canvas.addEventListener('pointermove', this._boundPointerMove)
    canvas.addEventListener('pointerup', this._boundPointerUp)
    canvas.addEventListener('pointercancel', this._boundPointerCancel)
    canvas.addEventListener('wheel', this._boundWheel, { passive: false })
    if (this._boundClick) {
      canvas.addEventListener('click', this._boundClick)
    }
  }

  /** Programmatically apply a pan delta (screen-space pixels). Also usable from tests. */
  onPan(delta: THREE.Vector2): void {
    this._panCb(delta)
    this._onDirty()
  }

  /** Programmatically apply a zoom (factor + NDC cursor point). Also usable from tests. */
  onZoom(factor: number, ndcPoint: THREE.Vector2): void {
    this._zoomCb(factor, ndcPoint)
    this._onDirty()
  }

  get isPanning(): boolean {
    return this._panPressed
  }

  get isLeftDragging(): boolean {
    return this._leftDragActive
  }

  get leftHasDragged(): boolean {
    return this._leftHasDragged
  }

  destroy(): void {
    this._canvas.removeEventListener('pointerdown', this._boundPointerDown)
    this._canvas.removeEventListener('pointermove', this._boundPointerMove)
    this._canvas.removeEventListener('pointerup', this._boundPointerUp)
    this._canvas.removeEventListener('pointercancel', this._boundPointerCancel)
    this._canvas.removeEventListener('wheel', this._boundWheel)
    if (this._boundClick) {
      this._canvas.removeEventListener('click', this._boundClick)
    }
  }
}
