import type { AppContext, Feature } from '../lib/feature'
import { REGION_COLOR } from '../lib/colors'
import { makeInfoRow } from '../lib/dom'

/**
 * Aggregation demo: groups sectors by the province suffix of their
 * "County, Province" name into regions via a parentMapping built from
 * sectorKeys, uploads it, then renders one selector button per province.
 * Mounts before borders.ts, which reuses the uploaded parentMapping.
 */
export function createRegions(ctx: AppContext): Feature {
  const buttonsEl = document.getElementById('regions-buttons')!
  const outputEl = document.getElementById('regions-output')!
  const ac = new AbortController()

  let provinceNames: string[] = []
  let regionMembers: string[][] = []
  let selectedRegion: number | null = null
  let buttons: HTMLButtonElement[] = []

  const resetOutput = (): void => {
    outputEl.classList.add('empty-state')
    outputEl.textContent = 'Select a region to see its bounding box'
  }

  const deselectRegion = (): void => {
    ctx.highlights.clearLayer('region')
    selectedRegion = null
    for (const btn of buttons) btn.classList.remove('active')
    resetOutput()
  }

  const selectRegion = (groupId: number): void => {
    if (selectedRegion === groupId) {
      deselectRegion()
      return
    }
    if (selectedRegion !== null) deselectRegion()

    selectedRegion = groupId
    for (const hex of regionMembers[groupId]) {
      ctx.highlights.set(hex, 'region', REGION_COLOR)
    }
    buttons.forEach((btn, i) => btn.classList.toggle('active', i === groupId))

    const [minX, minY, maxX, maxY] = ctx.engine.getGroupBBox(groupId)
    outputEl.classList.remove('empty-state')
    outputEl.replaceChildren(
      makeInfoRow('region', provinceNames[groupId]),
      makeInfoRow('bbox', `${minX},${minY} → ${maxX},${maxY}`),
      makeInfoRow('size', `${maxX - minX + 1} × ${maxY - minY + 1} px`)
    )
  }

  return {
    async mount() {
      const keys = ctx.sectorKeys
      const provinceIndex = new Map<string, number>()
      const members: string[][] = []
      const mapping = new Uint16Array(keys.length)

      keys.forEach((key, id) => {
        const name = ctx.engine.getSector(key)?.name ?? ''
        const commaAt = name.lastIndexOf(',')
        const province = commaAt >= 0 ? name.slice(commaAt + 1).trim() : ''

        if (!province) {
          mapping[id] = 0xffff
          return
        }
        let groupId = provinceIndex.get(province)
        if (groupId === undefined) {
          groupId = provinceIndex.size
          provinceIndex.set(province, groupId)
          members.push([])
        }
        mapping[id] = groupId
        members[groupId].push(key)
      })

      provinceNames = [...provinceIndex.keys()]
      regionMembers = members

      await ctx.engine.setParentMapping(mapping, provinceNames.length)
      await ctx.engine.aggregateGroups()

      buttons = provinceNames.map((name, index) => {
        const btn = document.createElement('button')
        btn.textContent = name
        btn.addEventListener('click', () => selectRegion(index), {
          signal: ac.signal,
        })
        return btn
      })
      buttonsEl.replaceChildren(...buttons)
      resetOutput()
    },
    destroy() {
      ac.abort()
      deselectRegion()
      buttonsEl.replaceChildren()
      buttons = []
    },
  }
}
