import type { PickResult } from 'map-engine'
import type { AppContext, Feature } from '../lib/feature'
import { NEIGHBOR_COLOR } from '../lib/colors'
import { buildSectorDataRows, makeInfoRow, makeSkeletonRow } from '../lib/dom'

const SELECTED_SKELETON = ['hex', 'name']
const ADVANCED_SKELETON = ['bbox', 'centroid']

/** Selected + advanced + neighbor panels, hue pulse, neighbor highlighting. */
export function createSelection(ctx: AppContext): Feature {
  const selectedContent = document.getElementById('selected-content')!
  const advancedContent = document.getElementById('advanced-content')!
  const neighborOutput = document.getElementById('neighbor-output')!
  let selectedHex: string | null = null
  let pulsePhase = 0

  const clearPanels = (): void => {
    selectedContent.classList.add('empty-state')
    selectedContent.replaceChildren(...SELECTED_SKELETON.map(makeSkeletonRow))
    advancedContent.replaceChildren(...ADVANCED_SKELETON.map(makeSkeletonRow))
  }

  const clearNeighbors = (): void => {
    ctx.highlights.clearLayer('neighbor')
    neighborOutput.textContent = '—'
  }

  const deselect = (): void => {
    if (!selectedHex) return
    ctx.highlights.clear(selectedHex, 'selected')
    selectedHex = null
    pulsePhase = 0
    clearNeighbors()
    clearPanels()
  }

  const onClick = (result: PickResult): void => {
    if (selectedHex === result.hexKey) {
      deselect()
      return
    }
    deselect()
    selectedHex = result.hexKey
    pulsePhase = 0

    selectedContent.classList.remove('empty-state')
    selectedContent.replaceChildren(
      ...buildSectorDataRows(result.sectorData, result.hexKey)
    )
    const bbox = ctx.engine.getBBox(result.hexKey)
    const centroid = ctx.engine.getCentroid(result.hexKey)
    advancedContent.replaceChildren(
      makeInfoRow('bbox', `${bbox[0]},${bbox[1]} → ${bbox[2]},${bbox[3]}`),
      makeInfoRow(
        'centroid',
        `(${centroid[0].toFixed(1)}, ${centroid[1].toFixed(1)})`
      )
    )

    const ns = ctx.engine.getNeighbors(result.hexKey)
    const shown: string[] = []
    if (ns) {
      for (const hex of ns) {
        ctx.highlights.set(hex, 'neighbor', NEIGHBOR_COLOR)
        shown.push(hex)
      }
    }
    neighborOutput.textContent = shown.length > 0 ? shown.join(', ') : '(none)'
  }

  const onFrame = (dt: number): void => {
    if (!selectedHex) return
    pulsePhase = (pulsePhase + dt * 1.5) % 1
    const hue = Math.round(pulsePhase * 360)
    ctx.highlights.set(selectedHex, 'selected', `hsl(${hue}, 90%, 55%)`)
  }

  return {
    mount() {
      clearPanels()
      neighborOutput.textContent = '—'
      ctx.engine.on('sectorClick', onClick)
      ctx.engine.onFrame(onFrame)
    },
    destroy() {
      ctx.engine.off('sectorClick', onClick)
      ctx.engine.offFrame(onFrame)
      deselect()
    },
  }
}
