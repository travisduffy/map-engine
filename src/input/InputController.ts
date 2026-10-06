import * as THREE from 'three'

import type { PickEvent } from '../shared/types.js'

/** Callback contract the owning `MapRenderer` supplies: `onDirty` flags a re-render, `pan`/`zoom` apply the camera transform, and the optional `pointerMove`/`click` forward resolved pick events. */
interface InputControllerOptions {
  onDirty: () => void
  pan: (delta: THREE.Vector2) => void
  zoom: (factor: number, ndcPoint: THREE.Vector2) => void
  pointerMove?: (e: PickEvent) => void
  click?: (e: PickEvent) => void
}

/**
 * Owns every pointer/wheel listener on the canvas (main-thread, DOM consumer).
 * Middle-button drag pans, wheel zooms about the cursor, one-finger touch drag
 * pans, two-finger pinch zooms about the midpoint, and left-button drag
 * is tracked through a dead-zone state machine so a small press-release still
 * reads as a click while a real drag suppresses the synthesized click and
 * hover. Exposes the live gesture state (`isPanning`/`isLeftDragging`/
 * `leftHasDragged`) the renderer and pick pipeline read.
 */
export class InputController {
  private static readonly _DRAG_DEAD_ZONE_PX = 4

  private _isPanPressed = false
  private _isPanning = false
  private _panOrigin = { x: 0, y: 0 }
  private _lastPointerPos = { x: 0, y: 0 }

  private _isLeftPressed = false
  private _isLeftDragActive = false
  private _hasLeftDragged = false
  private _leftDragOrigin = { x: 0, y: 0 }

  private readonly _touchPoints = new Map<number, { x: number; y: number }>()
  private _isTouchPanning = false
  private _touchOrigin = { x: 0, y: 0 }
  private _pinchDistance = 0
  private _pinchMid = { x: 0, y: 0 }

  private readonly _canvas: HTMLCanvasElement
  private readonly _onDirty: () => void
  private readonly _panCb: (delta: THREE.Vector2) => void
  private readonly _zoomCb: (factor: number, ndcPoint: THREE.Vector2) => void

  // Retained bound listener references so `destroy()` can remove exactly what
  // was added; each closure body holds the pan/drag/zoom gesture logic.
  private readonly _boundPointerDown: (e: PointerEvent) => void
  private readonly _boundPointerMove: (e: PointerEvent) => void
  private readonly _boundPointerUp: (e: PointerEvent) => void
  private readonly _boundPointerCancel: (e: PointerEvent) => void
  private readonly _boundWheel: (e: WheelEvent) => void
  private readonly _boundClick: ((e: PickEvent) => void) | null

  /** Wires all pointer/wheel listeners on `canvas` and captures the owner's `options` callbacks. The gesture state machines (pan dead-zone, left-drag detection) live in the bound-handler bodies built here. */
  constructor(canvas: HTMLCanvasElement, options: InputControllerOptions) {
    this._canvas = canvas
    this._onDirty = options.onDirty
    this._panCb = options.pan
    this._zoomCb = options.zoom

    this._boundPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        this._touchDown(e)
        return
      }

      if (e.button === 1) {
        this._isPanPressed = true
        this._isPanning = false
        this._panOrigin = { x: e.clientX, y: e.clientY }
        this._lastPointerPos = { x: e.clientX, y: e.clientY }
        try {
          canvas.setPointerCapture(e.pointerId)
        } catch (_) {
          // Synthetic test events may not have a capturable pointer ID.
        }
      } else if (e.button === 0) {
        this._isLeftPressed = true
        this._isLeftDragActive = false
        this._hasLeftDragged = false
        this._leftDragOrigin = { x: e.clientX, y: e.clientY }
      }
    }

    this._boundPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        this._touchMove(e)
        if (options.pointerMove) {
          options.pointerMove(e)
        }
        return
      }

      if (this._isLeftPressed && (e.buttons & 1) === 0) {
        this._isLeftPressed = false
        this._isLeftDragActive = false
      }

      if (this._isPanPressed) {
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

      if (this._isLeftPressed && !this._isLeftDragActive) {
        const dist = Math.hypot(
          e.clientX - this._leftDragOrigin.x,
          e.clientY - this._leftDragOrigin.y
        )
        if (dist > InputController._DRAG_DEAD_ZONE_PX) {
          this._isLeftDragActive = true
          this._hasLeftDragged = true
        }
      }

      if (options.pointerMove) options.pointerMove(e)
    }

    this._boundPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        this._touchUp(e)
        return
      }

      if (e.button === 1) {
        this._isPanPressed = false
        this._isPanning = false
      } else if (e.button === 0) {
        this._isLeftPressed = false
        this._isLeftDragActive = false
      }
    }

    this._boundPointerCancel = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        this._touchUp(e)
      }
      this._isPanPressed = false
      this._isPanning = false
      this._isLeftPressed = false
      this._isLeftDragActive = false
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

  // True during a middle-button pan or a touch pan or pinch gesture.
  get isPanning(): boolean {
    return (
      this._isPanPressed || this._isTouchPanning || this._touchPoints.size >= 2
    )
  }

  /** True once a left-button press has crossed the drag dead zone (a real drag, not a click). */
  get isLeftDragging(): boolean {
    return this._isLeftDragActive
  }

  /** True if the current/last left-button gesture ever became a drag — read to suppress the synthesized click that follows a drag. */
  get leftHasDragged(): boolean {
    return this._hasLeftDragged
  }

  private _measurePinch() {
    const [first, second] = [...this._touchPoints.values()]
    return {
      distance: Math.hypot(second.x - first.x, second.y - first.y),
      mid: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    }
  }

  private _touchDown(e: PointerEvent) {
    // A third finger is ignored so it cannot disturb the pinch.
    if (this._touchPoints.size >= 2) {
      return
    }

    this._touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY })
    try {
      this._canvas.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic test events may not have a capturable pointer ID.
    }

    if (this._touchPoints.size === 1) {
      this._touchOrigin = { x: e.clientX, y: e.clientY }
      this._hasLeftDragged = false
      return
    }

    const { distance, mid } = this._measurePinch()
    this._pinchDistance = distance
    this._pinchMid = mid
    this._hasLeftDragged = true
  }

  private _touchMove(e: PointerEvent) {
    const last = this._touchPoints.get(e.pointerId)
    if (!last) {
      return
    }

    this._touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (this._touchPoints.size === 1) {
      if (!this._isTouchPanning) {
        const dist = Math.hypot(
          e.clientX - this._touchOrigin.x,
          e.clientY - this._touchOrigin.y
        )
        if (dist <= InputController._DRAG_DEAD_ZONE_PX) return

        this._isTouchPanning = true
        this._hasLeftDragged = true
      }
      this.onPan(new THREE.Vector2(e.clientX - last.x, e.clientY - last.y))
      return
    }

    const { distance, mid } = this._measurePinch()
    const rect = this._canvas.getBoundingClientRect()
    const ndcX = ((mid.x - rect.left) / rect.width) * 2 - 1
    const ndcY = -(((mid.y - rect.top) / rect.height) * 2 - 1)

    if (this._pinchDistance > 0 && distance > 0) {
      this.onZoom(distance / this._pinchDistance, new THREE.Vector2(ndcX, ndcY))
    }
    this.onPan(
      new THREE.Vector2(mid.x - this._pinchMid.x, mid.y - this._pinchMid.y)
    )
    this._pinchDistance = distance
    this._pinchMid = mid
  }

  private _touchUp(e: PointerEvent) {
    if (!this._touchPoints.delete(e.pointerId)) {
      return
    }

    if (this._touchPoints.size === 1) {
      // Restart the pan from the finger that stays, so the view does not jump.
      const [remaining] = [...this._touchPoints.values()]
      this._touchOrigin = { ...remaining }
      this._isTouchPanning = false
      return
    }

    this._isTouchPanning = false
    this._pinchDistance = 0
  }

  /** Removes every listener this controller added (symmetric with the constructor). Call on renderer teardown. */
  destroy(): void {
    this._canvas.removeEventListener('pointerdown', this._boundPointerDown)
    this._canvas.removeEventListener('pointermove', this._boundPointerMove)
    this._canvas.removeEventListener('pointerup', this._boundPointerUp)
    this._canvas.removeEventListener('pointercancel', this._boundPointerCancel)
    this._canvas.removeEventListener('wheel', this._boundWheel)
    if (this._boundClick) {
      this._canvas.removeEventListener('click', this._boundClick)
    }
    this._touchPoints.clear()
    this._isTouchPanning = false
    this._pinchDistance = 0
  }
}
