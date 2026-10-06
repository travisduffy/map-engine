import type { MapView, PickResult } from 'map-engine'
import type { AppContext, Feature } from '../lib/feature'

const FIT_PADDING_PX = 16

/**
 * Camera panel: fitBounds() frames the selected sector, setView() resets the
 * zoom, and getView() feeds a readout that the viewChange event keeps current.
 */
export const createCamera = (ctx: AppContext): Feature => {
  const section = document.createElement('section')
  section.id = 'camera-panel'
  const heading = document.createElement('h2')
  heading.textContent = 'Camera'
  const readout = document.createElement('div')
  const row = document.createElement('div')
  row.className = 'button-row'
  const fitButton = document.createElement('button')
  fitButton.textContent = 'Fit selected'
  fitButton.disabled = true
  const resetButton = document.createElement('button')
  resetButton.textContent = 'Reset zoom'
  row.append(fitButton, resetButton)
  section.append(heading, readout, row)
  const ac = new AbortController()
  // selection.ts keeps its selection private, so the panel tracks sectorClick
  // with the same toggle.
  let selectedHex: string | null = null

  const showView = (view: MapView | null) => {
    if (!view) {
      return
    }
    const { centerX, centerY, zoom } = view
    const center = `${centerX.toFixed(1)}, ${centerY.toFixed(1)}`
    readout.textContent = `center ${center} · zoom ${zoom.toFixed(2)}`
  }

  // Mirrors the toggle of the selection panel: a second click deselects.
  const onClick = (result: PickResult) => {
    selectedHex = selectedHex === result.hexKey ? null : result.hexKey
    fitButton.disabled = selectedHex === null
  }

  const fitSelected = () => {
    if (!selectedHex) {
      return
    }
    ctx.engine.fitBounds(ctx.engine.getBBox(selectedHex), {
      padding: FIT_PADDING_PX,
    })
  }

  return {
    mount() {
      document.getElementById('neighbor-panel')!.after(section)
      selectedHex = null
      fitButton.disabled = true
      showView(ctx.engine.getView())
      ctx.engine.on('sectorClick', onClick)
      ctx.engine.on('viewChange', showView)
      fitButton.addEventListener('click', fitSelected, { signal: ac.signal })
      resetButton.addEventListener(
        'click',
        () => ctx.engine.setView({ zoom: 1 }),
        { signal: ac.signal }
      )
    },
    destroy() {
      ctx.engine.off('sectorClick', onClick)
      ctx.engine.off('viewChange', showView)
      ac.abort()
      section.remove()
    },
  }
}
