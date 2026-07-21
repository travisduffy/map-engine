import { PathNotFoundError } from 'map-engine'
import type { AppContext, Feature } from '../lib/feature'
import { PATH_START_COLOR, PATH_ROUTE_COLOR } from '../lib/colors'

/** Right-click to set start then end; findPath() route highlighting. */
export function createPathfinding(ctx: AppContext): Feature {
  const output = document.getElementById('pathfinding-output')!
  const clearBtn = document.getElementById('btn-path-clear')!
  const ac = new AbortController()
  let startHex: string | null = null

  const clearPath = (): void => ctx.highlights.clearLayer('path')
  const resetOutput = (): void => {
    output.textContent = 'Right-click two sectors to find a path'
  }

  const onContextMenu = (e: MouseEvent): void => {
    e.preventDefault()
    void handlePick(e.clientX, e.clientY)
  }

  const handlePick = async (
    clientX: number,
    clientY: number
  ): Promise<void> => {
    const result = await ctx.engine.pick({ clientX, clientY })
    // A Reload can destroy this feature while pick() was in flight.
    if (ac.signal.aborted || !result) return

    if (!startHex) {
      clearPath()
      startHex = result.hexKey
      ctx.highlights.set(result.hexKey, 'path', PATH_START_COLOR)
      output.textContent = `Start: #${result.hexKey} — right-click an end sector`
      return
    }

    const from = startHex
    const to = result.hexKey
    startHex = null
    if (from === to) {
      clearPath()
      resetOutput()
      return
    }

    const startId = ctx.hexToId.get(from)
    const endId = ctx.hexToId.get(to)
    if (startId === undefined || endId === undefined) return

    output.textContent = `Finding path from #${from} to #${to}…`
    try {
      const path = await ctx.engine.findPath(startId, endId)
      if (ac.signal.aborted) return
      clearPath()
      const hexPath = Array.from(path).map(id => ctx.sectorKeys[id])
      for (const hex of hexPath)
        ctx.highlights.set(hex, 'path', PATH_ROUTE_COLOR)
      output.textContent = `Path: ${hexPath.length} sectors — #${hexPath.join(' → #')}`
    } catch (err) {
      if (ac.signal.aborted) return
      clearPath()
      output.textContent =
        err instanceof PathNotFoundError
          ? `No path exists between #${from} and #${to}`
          : `Pathfinding failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  return {
    async mount() {
      await ctx.engine.setTraversalCosts(
        new Uint8Array(ctx.sectorKeys.length).fill(1)
      )
      resetOutput()
      ctx.canvas.addEventListener('contextmenu', onContextMenu, {
        signal: ac.signal,
      })
      clearBtn.addEventListener(
        'click',
        () => {
          startHex = null
          clearPath()
          resetOutput()
        },
        { signal: ac.signal }
      )
    },
    destroy() {
      ac.abort()
      clearPath()
      startHex = null
    },
  }
}
