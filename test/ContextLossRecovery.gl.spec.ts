import { describe, it, expect, vi } from 'vitest'
import { MapEngine } from '../src/MapEngine'
import type { MapRenderer } from '../src/MapRenderer'
import { ThreeRenderBackend } from '../src/render/ThreeRenderBackend'
import { makeCanvas } from './testUtils'

const BORDERS_BITMAP = '/test/fixtures/borders/maps/two-adjacent-groups.png'
const BORDERS_DEFINITION =
  '/test/fixtures/borders/maps/two-adjacent-groups.json'

const REFERENCE_RECOVERY_TOLERANCE_MS = 100
const POLL_BUDGET_MS = 3000

function waitForRaf(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
}

/**
 * Polls a condition via real `requestAnimationFrame` ticks rather than a
 * passive event listener. Chromium/ANGLE's `WEBGL_lose_context` restoration
 * appears to process (and fire `webglcontextrestored`) in step with the
 * page's animation-frame pipeline -- a bare `addEventListener` + `await`
 * with nothing else pumping rAF (e.g. because the renderer's own loop is
 * deliberately paused, see below) can leave the event never firing at all.
 * Actively polling via rAF is what makes this reliable.
 */
async function waitForCondition(
  isTrue: () => boolean,
  budgetMs: number
): Promise<boolean> {
  const deadline = performance.now() + budgetMs
  while (!isTrue() && performance.now() < deadline) {
    await waitForRaf()
  }
  return isTrue()
}

/**
 * F-4.10 context-loss recovery acceptance (Epic 8 Task 8.4). Simulates a
 * real `WEBGL_lose_context` loss/restore cycle (not a synthetic dispatched
 * event -- `ThreeRenderBackend.gl.spec.ts`'s existing context-restore test
 * dispatches a plain `Event('webglcontextrestored')` directly, which is
 * sufficient for that unit-level assertion but doesn't exercise the real
 * WebGL extension's async event timing this gate specifically measures).
 *
 * Per the epic: "the 100ms window is measured from the `webglcontextrestored`
 * event firing (dispatched asynchronously by `restoreContext()`, not
 * synchronously) -- not from the `restoreContext()` call itself." The
 * standing 5.0x software-rendering tolerance (PalettePerf.gl.spec.ts
 * precedent) applies; the strict 100ms gate is authoritative only on
 * reference hardware. The raw measured time is logged regardless of which
 * tolerance applied.
 */
describe('F-4.10 context-loss recovery — Epic 8 Task 8.4', () => {
  it('recovers (index texture + border VBO re-upload + a rendered frame) within the tolerance window', async () => {
    const canvas = makeCanvas()
    const engine = new MapEngine()
    try {
      await engine.loadMap({
        bitmapUrl: BORDERS_BITMAP,
        definitionUrl: BORDERS_DEFINITION,
        canvas,
      })
      await engine.setParentMapping(new Uint16Array([0, 1]), 2)
      await engine.recomputeBorders()

      const renderer = engine['_renderer'] as MapRenderer
      const backend = renderer['_backend'] as ThreeRenderBackend
      const gl = backend
        .getThreeRenderer()
        .getContext() as WebGL2RenderingContext

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      const rendererString = debugInfo
        ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER))
      const isSoftwareRendered = /swiftshader|llvmpipe|software/i.test(
        rendererString
      )
      const toleranceMs = isSoftwareRendered
        ? REFERENCE_RECOVERY_TOLERANCE_MS * 5.0
        : REFERENCE_RECOVERY_TOLERANCE_MS

      const loseCtx = gl.getExtension('WEBGL_lose_context')
      if (!loseCtx) {
        // Some headless/software GL stacks don't expose this extension at
        // all -- skip rather than false-failing an environment that
        // structurally can't exercise this path.
        console.warn(
          '[F-4.10] WEBGL_lose_context unavailable in this environment -- skipping'
        )
        return
      }

      const reuploadIndexSpy = vi.spyOn(backend, 'reuploadIndexTexture')
      const uploadBorderSpy = vi.spyOn(backend, 'uploadBorderEdges')
      const renderSpy = vi.spyOn(backend.getThreeRenderer(), 'render')

      // Pause the render loop before triggering loss: three.js's own
      // shader-program (re)compilation path can throw while the GL context
      // is mid-loss/restore (`getProgramInfoLog()` legitimately returns
      // `null` for a lost context per spec, which an unrelated three.js
      // internal helper doesn't null-check) -- letting the background rAF
      // loop keep rendering across that transitional window is an
      // independent hazard this gate isn't testing for. `waitForCondition`
      // below still pumps rAF itself (see its doc comment) -- pausing only
      // stops MapRenderer's own render/resize logic from running each tick.
      renderer._pauseLoop()
      const callsBefore = renderSpy.mock.calls.length

      let lost = false
      canvas.addEventListener('webglcontextlost', () => {
        lost = true
      })
      let restoredAt: number | null = null
      canvas.addEventListener('webglcontextrestored', () => {
        restoredAt = performance.now()
      })

      loseCtx.loseContext()
      const gotLost = await waitForCondition(() => lost, POLL_BUDGET_MS)
      expect(gotLost).toBe(true)

      loseCtx.restoreContext()
      const gotRestored = await waitForCondition(
        () => restoredAt !== null,
        POLL_BUDGET_MS
      )
      expect(gotRestored).toBe(true)

      // Resume only now that restoration is confirmed, and keep polling
      // (still via real rAF) until the renderer actually draws a frame.
      renderer._resumeLoop()
      await waitForCondition(
        () => renderSpy.mock.calls.length > callsBefore,
        POLL_BUDGET_MS
      )
      const recoveredAt = performance.now()
      const elapsedMs = recoveredAt - restoredAt!

      console.log(
        `[F-4.10] renderer="${rendererString}" elapsed=${elapsedMs.toFixed(3)}ms ` +
          `tolerance=${toleranceMs}ms (software=${isSoftwareRendered})`
      )

      expect(reuploadIndexSpy).toHaveBeenCalled()
      expect(uploadBorderSpy).toHaveBeenCalled()
      expect(renderSpy.mock.calls.length).toBeGreaterThan(callsBefore)
      expect(elapsedMs).toBeLessThanOrEqual(toleranceMs)
    } finally {
      engine.destroy()
      canvas.remove()
    }
  }, 20000)
})
