import type { PickResult } from 'map-engine'
import type { AppContext, Feature } from '../lib/feature'
import { HOVER_COLOR } from '../lib/colors'
import { buildSectorDataRows, makeInfoRow, makeSkeletonRow } from '../lib/dom'

const SKELETON = ['hex', 'name', 'pixel']

/** Hover panel + hover highlight; the checkbox toggles the subscription. */
export function createHover(ctx: AppContext): Feature {
  const content = document.getElementById('hover-content')!
  const checkbox = document.getElementById('chk-hover') as HTMLInputElement
  const ac = new AbortController()
  let lastHovered: string | null = null
  let isEnabled = true

  const clearPanel = (): void => {
    content.replaceChildren(...SKELETON.map(makeSkeletonRow))
  }

  const onHover = (result: PickResult | null): void => {
    if (lastHovered) {
      ctx.highlights.clear(lastHovered, 'hover')
      lastHovered = null
    }
    if (result) {
      ctx.highlights.set(result.hexKey, 'hover', HOVER_COLOR)
      lastHovered = result.hexKey
      content.replaceChildren(
        ...buildSectorDataRows(result.sectorData, result.hexKey),
        makeInfoRow('pixel', `(${result.pixelX}, ${result.pixelY})`)
      )
    } else {
      clearPanel()
    }
  }

  const onToggle = (): void => {
    isEnabled = checkbox.checked
    if (isEnabled) {
      ctx.engine.on('sectorHover', onHover)
    } else {
      ctx.engine.off('sectorHover', onHover)
      if (lastHovered) {
        ctx.highlights.clear(lastHovered, 'hover')
        lastHovered = null
      }
      clearPanel()
    }
  }

  return {
    mount() {
      clearPanel()
      checkbox.checked = true
      isEnabled = true
      ctx.engine.on('sectorHover', onHover)
      checkbox.addEventListener('change', onToggle, { signal: ac.signal })
    },
    destroy() {
      ac.abort()
      if (isEnabled) ctx.engine.off('sectorHover', onHover)
      if (lastHovered) ctx.highlights.clear(lastHovered, 'hover')
      lastHovered = null
    },
  }
}
