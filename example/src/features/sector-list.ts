import { toHexKey } from 'map-engine'
import type { AppContext, Feature } from '../lib/feature'
import { assertSafeHexKey } from '../lib/dom'

/** Sector list panel + toHexKey round-trip demo. */
export function createSectorList(ctx: AppContext): Feature {
  const countEl = document.getElementById('sector-count')!
  const listEl = document.getElementById('sector-list')!

  const render = (): void => {
    countEl.textContent = String(ctx.sectorKeys.length)
    const items: HTMLElement[] = ctx.sectorKeys.map(key => {
      const data = ctx.engine.getSector(key)
      const li = document.createElement('li')
      li.className = 'sector-item'
      const sw = document.createElement('span')
      sw.className = 'swatch'
      sw.style.background = '#' + assertSafeHexKey(key)
      const name = document.createElement('span')
      name.className = 'sector-name'
      name.textContent = data?.name ?? '(unnamed)'
      const keySpan = document.createElement('span')
      keySpan.className = 'sector-key'
      keySpan.textContent = '#' + key
      li.appendChild(sw)
      li.appendChild(name)
      li.appendChild(keySpan)
      return li
    })
    listEl.replaceChildren(...items)
  }

  const demoToHexKeyRoundTrip = (): void => {
    if (ctx.sectorKeys.length === 0) return
    const first = ctx.sectorKeys[0]
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

  return {
    mount() {
      render()
      demoToHexKeyRoundTrip()
    },
    destroy() {
      countEl.textContent = '0'
      listEl.replaceChildren()
    },
  }
}
