import type { AppContext, Feature } from '../lib/feature'

/**
 * Group perimeter show/hide. Lazily computes borders on first click (reusing
 * the parentMapping uploaded by regions.ts), then just toggles visibility.
 */
export function createBorders(ctx: AppContext): Feature {
  const toggleBtn = document.getElementById('btn-borders-show')!
  const outputEl = document.getElementById('borders-output')!
  const ac = new AbortController()

  let isComputed = false
  let isVisible = false

  const resetOutput = (): void => {
    outputEl.classList.add('empty-state')
    outputEl.textContent = 'Show borders to draw province perimeters'
  }

  const setToggleLabel = (): void => {
    toggleBtn.textContent = isVisible
      ? 'Hide group borders'
      : 'Show group borders'
  }

  const toggle = async (): Promise<void> => {
    if (!isComputed) {
      await ctx.engine.recomputeBorders()
      if (ac.signal.aborted) return
      isComputed = true
      const segments = ctx.engine.getBorderSegments()
      const n = segments ? segments.length / 4 : 0
      outputEl.classList.remove('empty-state')
      outputEl.textContent = `${n} border segment${n === 1 ? '' : 's'} drawn`
    }

    isVisible = !isVisible
    ctx.engine.setBordersVisible(isVisible)
    setToggleLabel()
  }

  return {
    mount() {
      isComputed = false
      isVisible = false
      resetOutput()
      setToggleLabel()
      toggleBtn.addEventListener('click', () => void toggle(), {
        signal: ac.signal,
      })
    },
    destroy() {
      ac.abort()
      isVisible = false
      setToggleLabel()
      resetOutput()
    },
  }
}
