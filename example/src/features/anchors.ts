import type { AppContext, Feature } from '../lib/feature'

/**
 * Anchor/centroid markers: computeAnchors() is lazy (fires on first toggle),
 * getAnchor(id) is the guaranteed-interior label point contrasted against
 * getCentroid(id) (can fall outside concave/annulus/spiral shapes). Markers
 * reproject from bitmap pixel-space to screen-space every frame via project().
 */
export function createAnchors(ctx: AppContext): Feature {
  const toggleBtn = document.getElementById('btn-anchors-toggle')!
  const outputEl = document.getElementById('anchors-output')!
  const mapContainer = document.getElementById('map-container')!
  const ac = new AbortController()

  let isComputed = false
  let isVisible = false
  let anchorEls: HTMLElement[] = []
  let centroidEls: HTMLElement[] = []

  const resetOutput = (): void => {
    outputEl.classList.add('empty-state')
    outputEl.textContent = 'Toggle anchors to see computed label points'
  }

  const setToggleLabel = (): void => {
    toggleBtn.textContent = isVisible ? 'Hide anchors' : 'Show anchors'
  }

  const reproject = (): void => {
    for (let id = 0; id < ctx.sectorKeys.length; id++) {
      const [ax, ay] = ctx.engine.getAnchor(id)
      const [sx, sy] = ctx.engine.project(ax, ay)
      anchorEls[id].style.left = `${sx}px`
      anchorEls[id].style.top = `${sy}px`

      const [cx, cy] = ctx.engine.getCentroid(id)
      const [csx, csy] = ctx.engine.project(cx, cy)
      centroidEls[id].style.left = `${csx}px`
      centroidEls[id].style.top = `${csy}px`
    }
  }

  const onFrame = (): void => {
    if (isVisible) reproject()
  }

  const toggle = async (): Promise<void> => {
    if (!isComputed) {
      outputEl.classList.remove('empty-state')
      outputEl.textContent = 'Computing anchors…'
      await ctx.engine.computeAnchors()
      if (ac.signal.aborted) return
      isComputed = true

      for (let i = 0; i < ctx.sectorKeys.length; i++) {
        const anchorEl = document.createElement('div')
        anchorEl.className = 'anchor-marker'
        mapContainer.appendChild(anchorEl)
        anchorEls.push(anchorEl)

        const centroidEl = document.createElement('div')
        centroidEl.className = 'centroid-marker'
        mapContainer.appendChild(centroidEl)
        centroidEls.push(centroidEl)
      }

      outputEl.textContent = `${ctx.sectorKeys.length} anchors computed — red = anchor (guaranteed interior), blue = centroid (can fall outside concave/annulus/spiral shapes)`
    }

    isVisible = !isVisible
    const display = isVisible ? '' : 'none'
    for (const el of anchorEls) el.style.display = display
    for (const el of centroidEls) el.style.display = display
    setToggleLabel()
    if (isVisible) reproject()
  }

  return {
    mount() {
      isComputed = false
      isVisible = false
      anchorEls = []
      centroidEls = []
      resetOutput()
      setToggleLabel()
      ctx.engine.onFrame(onFrame)
      toggleBtn.addEventListener('click', () => void toggle(), {
        signal: ac.signal,
      })
    },
    destroy() {
      ctx.engine.offFrame(onFrame)
      ac.abort()
      for (const el of anchorEls) el.remove()
      for (const el of centroidEls) el.remove()
      anchorEls = []
      centroidEls = []
      isVisible = false
      setToggleLabel()
      resetOutput()
    },
  }
}
