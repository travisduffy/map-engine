import type { AppContext, Feature } from '../lib/feature'

/** Frame counter — demonstrates onFrame/offFrame in isolation. */
export function createFrameHook(ctx: AppContext): Feature {
  const counterEl = document.getElementById('frame-counter')!
  let frameCount = 0

  const onFrame = (): void => {
    frameCount++
    counterEl.textContent = `Frames: ${frameCount}`
  }

  return {
    mount() {
      frameCount = 0
      counterEl.textContent = 'Frames: 0'
      ctx.engine.onFrame(onFrame)
    },
    destroy() {
      ctx.engine.offFrame(onFrame)
      counterEl.textContent = 'Frames: 0'
    },
  }
}
